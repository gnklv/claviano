import type { ScoreWriter } from '../../application/ports/ScoreWriter';
import type { Hand } from '../../domain/note';
import type { Score } from '../../domain/score';

/*
 * A Standard MIDI File, written from scratch (the reader's other half: MidiFileParser reads what
 * this writes, to the same piece).
 *
 * Format 1: a first track with the time signature and the tempo, then a track for each hand (the
 * right first), as piano files usually have them: that is how a reader tells the hands apart.
 * Times are in ticks, 480 to the quarter note; the notes stand where the piece's notation has
 * them, in beats, so nothing is lost to seconds on the way.
 */
const TICKS_PER_QUARTER = 480;
const DEFAULT_QUARTERS_PER_MINUTE = 120;

/** A number of any size in MIDI's own way: seven bits to a byte, the high bit set on all but the last. */
function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

const ascii = (text: string): number[] => [...text].map((letter) => letter.charCodeAt(0));
const uint32 = (value: number): number[] => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const uint16 = (value: number): number[] => [(value >>> 8) & 0xff, value & 0xff];

/** A track: its events (each a tick and its bytes) in order, each told by how long after the one before, and the end. */
function track(events: readonly { tick: number; bytes: number[] }[]): number[] {
  const body: number[] = [];
  let last = 0;
  for (const event of [...events].sort((a, b) => a.tick - b.tick)) {
    body.push(...variableLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return [...ascii('MTrk'), ...uint32(body.length), ...body];
}

export class MidiFileWriter implements ScoreWriter {
  readonly extension = '.mid';

  write(score: Score): ArrayBuffer {
    const ticks = (beats: number) => Math.round(beats * TICKS_PER_QUARTER);

    const time = score.notation.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
    const perMinute = score.notation.tempoMarks[0]?.perMinute ?? DEFAULT_QUARTERS_PER_MINUTE;
    const microsecondsPerQuarter = Math.round(60_000_000 / perMinute);
    const conductor = track([
      // (The denominator as a power of two; then the metronome's and the notation's defaults.)
      { tick: 0, bytes: [0xff, 0x58, 4, time.numerator, Math.log2(time.denominator), 24, 8] },
      { tick: 0, bytes: [0xff, 0x51, 3, (microsecondsPerQuarter >>> 16) & 0xff, (microsecondsPerQuarter >>> 8) & 0xff, microsecondsPerQuarter & 0xff] },
    ]);

    const hand = (which: Hand) =>
      track(
        score.notes
          .filter((note) => note.hand === which)
          .flatMap((note) => {
            const velocity = Math.min(127, Math.max(1, Math.round(note.velocity * 127)));
            return [
              { tick: ticks(note.beat), bytes: [0x90, note.pitch, velocity] },
              // (A tick short of its length: a key struck again where it ends is let go first.)
              { tick: Math.max(ticks(note.beat) + 1, ticks(note.beat + note.beats) - 1), bytes: [0x80, note.pitch, 0] },
            ];
          }),
      );

    const tracks = [conductor, hand('right'), hand('left')];
    const header = [...ascii('MThd'), ...uint32(6), ...uint16(1), ...uint16(tracks.length), ...uint16(TICKS_PER_QUARTER)];
    return new Uint8Array([...header, ...tracks.flat()]).buffer;
  }
}
