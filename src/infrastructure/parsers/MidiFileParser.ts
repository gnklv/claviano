import { ScoreLoadError, type ScoreLoadErrorCode, type ScoreParser } from '../../application/ports/ScoreParser';
import { handBySplitPoint, type Hand, type Note } from '../../domain/note';
import { createScore, type Score } from '../../domain/score';

export class InvalidMidiError extends ScoreLoadError {
  constructor(message: string, code: ScoreLoadErrorCode = 'invalid-file') {
    super(code, message);
    this.name = 'InvalidMidiError';
  }
}

const DEFAULT_US_PER_QUARTER = 500_000; // 120 BPM
const DRUM_CHANNEL = 9;

interface RawNote {
  track: number;
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
}

interface TempoEvent {
  tick: number;
  usPerQuarter: number;
}

interface TimeSignatureEvent {
  tick: number;
  numerator: number;
  denominator: number;
}

interface MidiData {
  ticksPerQuarter: number;
  notes: RawNote[];
  tempos: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  lastTick: number;
}

class ByteReader {
  pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get length(): number {
    return this.bytes.length;
  }

  private ensure(count: number): void {
    if (this.pos + count > this.bytes.length) throw new InvalidMidiError('Unexpected end of file');
  }

  peek(): number {
    this.ensure(1);
    return this.bytes[this.pos];
  }

  u8(): number {
    this.ensure(1);
    return this.bytes[this.pos++];
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  /** Variable-length quantity: 7 bits per byte, high bit means "more bytes follow". */
  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new InvalidMidiError('Variable-length quantity is too long');
  }

  ascii(count: number): string {
    this.ensure(count);
    const text = String.fromCharCode(...this.bytes.subarray(this.pos, this.pos + count));
    this.pos += count;
    return text;
  }

  skip(count: number): void {
    this.ensure(count);
    this.pos += count;
  }
}

/** Reads Standard MIDI Files (format 0 and 1). */
export class MidiFileParser implements ScoreParser {
  canParse(fileName: string): boolean {
    return /\.midi?$/i.test(fileName);
  }

  parse(data: ArrayBuffer, title: string): Score {
    const midi = readMidi(new ByteReader(new Uint8Array(data)));
    const toSeconds = tickToSecondsConverter(midi.tempos, midi.ticksPerQuarter);
    const handOf = handAssigner(midi.notes);

    const notes: Note[] = midi.notes.map((raw) => {
      const start = toSeconds(raw.startTick);
      return {
        pitch: raw.pitch,
        start,
        duration: Math.max(0, toSeconds(raw.endTick) - start),
        velocity: raw.velocity / 127,
        hand: handOf(raw),
      };
    });

    const bars = barTicks(midi.timeSignatures, midi.ticksPerQuarter, midi.lastTick).map(toSeconds);
    return createScore(title, notes, bars);
  }
}

function readMidi(reader: ByteReader): MidiData {
  if (reader.length < 14 || reader.ascii(4) !== 'MThd') {
    throw new InvalidMidiError('Not a MIDI file: missing MThd header');
  }
  const headerLength = reader.u32();
  const headerEnd = reader.pos + headerLength;
  reader.u16(); // format: 0 and 1 are read the same way, 2 is rare enough to ignore
  const trackCount = reader.u16();
  const division = reader.u16();
  if (division & 0x8000) throw new InvalidMidiError('SMPTE time division is not supported', 'unsupported-feature');
  reader.pos = headerEnd;

  const data: MidiData = {
    ticksPerQuarter: division,
    notes: [],
    tempos: [],
    timeSignatures: [],
    lastTick: 0,
  };

  for (let track = 0; track < trackCount && reader.pos < reader.length; track++) {
    const chunkId = reader.ascii(4);
    const chunkLength = reader.u32();
    const chunkEnd = reader.pos + chunkLength;
    if (chunkId === 'MTrk') readTrack(reader, Math.min(chunkEnd, reader.length), track, data);
    else track--; // unknown chunks are allowed and must be skipped
    reader.pos = chunkEnd;
  }
  return data;
}

function readTrack(reader: ByteReader, end: number, track: number, data: MidiData): void {
  let tick = 0;
  let runningStatus = 0;
  /** Notes waiting for their note-off, keyed by channel * 128 + pitch. FIFO for repeated pitches. */
  const open = new Map<number, { tick: number; velocity: number }[]>();

  const closeNote = (channel: number, pitch: number) => {
    const queue = open.get(channel * 128 + pitch);
    const started = queue?.shift();
    if (started) {
      data.notes.push({ track, pitch, velocity: started.velocity, startTick: started.tick, endTick: tick });
    }
  };

  while (reader.pos < end) {
    tick += reader.vlq();
    let status = reader.peek();
    if (status & 0x80) {
      reader.pos++;
    } else {
      if (!runningStatus) throw new InvalidMidiError('Data byte without a status byte');
      status = runningStatus;
    }

    if (status === 0xff) {
      const type = reader.u8();
      const length = reader.vlq();
      const payloadEnd = reader.pos + length;
      if (type === 0x51 && length === 3) {
        data.tempos.push({ tick, usPerQuarter: (reader.u8() << 16) | (reader.u8() << 8) | reader.u8() });
      } else if (type === 0x58 && length >= 2) {
        data.timeSignatures.push({ tick, numerator: reader.u8(), denominator: 2 ** reader.u8() });
      } else if (type === 0x2f) {
        reader.pos = payloadEnd;
        break;
      }
      reader.pos = payloadEnd;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.vlq());
      continue;
    }

    runningStatus = status;
    const type = status >> 4;
    const channel = status & 0x0f;

    if (type === 0x9 || type === 0x8) {
      const pitch = reader.u8();
      const velocity = reader.u8();
      if (channel === DRUM_CHANNEL) continue;
      if (type === 0x9 && velocity > 0) {
        const key = channel * 128 + pitch;
        const queue = open.get(key) ?? [];
        queue.push({ tick, velocity });
        open.set(key, queue);
      } else {
        closeNote(channel, pitch); // note-on with velocity 0 is a note-off
      }
    } else if (type === 0xc || type === 0xd) {
      reader.skip(1);
    } else {
      reader.skip(2);
    }
  }

  for (const [key, queue] of open) {
    for (let i = queue.length; i > 0; i--) closeNote(Math.floor(key / 128), key % 128);
  }
  data.lastTick = Math.max(data.lastTick, tick);
}

function tickToSecondsConverter(tempos: TempoEvent[], ticksPerQuarter: number): (tick: number) => number {
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
  if (sorted.length === 0 || sorted[0].tick > 0) {
    sorted.unshift({ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  }

  const segments: { tick: number; seconds: number; secondsPerTick: number }[] = [];
  let seconds = 0;
  for (let i = 0; i < sorted.length; i++) {
    const secondsPerTick = sorted[i].usPerQuarter / 1e6 / ticksPerQuarter;
    if (i > 0) seconds += (sorted[i].tick - segments[i - 1].tick) * segments[i - 1].secondsPerTick;
    segments.push({ tick: sorted[i].tick, seconds, secondsPerTick });
  }

  return (tick) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick > tick) break;
      segment = candidate;
    }
    return segment.seconds + (tick - segment.tick) * segment.secondsPerTick;
  };
}

function barTicks(signatures: TimeSignatureEvent[], ticksPerQuarter: number, lastTick: number): number[] {
  const sorted = [...signatures].sort((a, b) => a.tick - b.tick);
  if (sorted.length === 0 || sorted[0].tick > 0) sorted.unshift({ tick: 0, numerator: 4, denominator: 4 });

  const bars: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const { tick, numerator, denominator } = sorted[i];
    const until = sorted[i + 1]?.tick ?? lastTick;
    const ticksPerBar = (ticksPerQuarter * 4 * numerator) / denominator;
    for (let t = tick; t < until; t += ticksPerBar) bars.push(t);
  }
  return bars;
}

/**
 * Piano MIDI files usually keep each hand in its own track; the higher one is the right hand.
 * With any other layout we fall back to splitting by pitch.
 */
function handAssigner(notes: RawNote[]): (note: RawNote) => Hand {
  const pitchSums = new Map<number, { sum: number; count: number }>();
  for (const note of notes) {
    const entry = pitchSums.get(note.track) ?? { sum: 0, count: 0 };
    entry.sum += note.pitch;
    entry.count++;
    pitchSums.set(note.track, entry);
  }
  if (pitchSums.size === 2) {
    const [[trackA, a], [trackB, b]] = [...pitchSums];
    const rightTrack = a.sum / a.count >= b.sum / b.count ? trackA : trackB;
    return (note) => (note.track === rightTrack ? 'right' : 'left');
  }
  return (note) => handBySplitPoint(note.pitch);
}
