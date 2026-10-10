import type { Hand } from '../../../domain/note';
import type { DynamicLevel, DynamicMark, Hairpin } from '../../../domain/notation/dynamics';
import type { Notation, PedalMove, TempoChange } from '../../../domain/notation/notation';
import type { Clef, ClefChange, WrittenGrace, WrittenGraces, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PedalMark } from '../../../domain/pedal';
import type { KeySignature, OctaveShift, TempoMark, TimeSignature } from '../../../domain/score';
import { metronomeMark, readDynamics, readNavigation, readPedal, type MutableNavigation, type PedalState } from './directions';
import { midiPitch, NOTE_TYPES, readRest, readWritten } from './notes';
import { childNumber, childText } from './xml';

/** The bar being read: what is known of it so far, and where in it the reading stands. */
interface OpenBar {
  readonly index: number;
  readonly navigation: MutableNavigation;
  /** A volta ends at this bar's line: the next bar is no longer under it. */
  endingEndsHere: boolean;
  /** Position inside the bar, in divisions. */
  cursor: number;
  /** How far the bar reaches, in divisions. */
  longest: number;
  /** Start of the previous note, for chords. */
  lastStart: number;
  /** Grace notes read and not yet attached to the note they lead to. */
  graces: WrittenGrace[];
}

/**
 * Reads a part along the page, bar by bar, into its notation: the printed notes, rests, clefs,
 * signatures and marks, as they stand. How all this is played is not decided here (see
 * performNotation in the domain).
 */
export class PartReader {
  // What holds from bar to bar.
  private divisions = 1;
  private staves = 1;
  /** Where the bar being read starts along the page, in quarter notes. */
  private barStart = 0;
  private timeSignature: TimeSignature = { beat: 0, numerator: 4, denominator: 4 };
  /** The volta the bars are under. */
  private ending: { numbers: number[]; label: string } | null = null;
  /** The clef in force on each staff; engravers may switch the lower staff to treble and back. */
  private readonly clefs = new Map<number, Clef>([
    [1, 'treble'],
    [2, 'bass'],
  ]);
  /** Octave shifts in force on each staff: where they started, how many octaves. */
  private readonly openShifts = new Map<number, { start: number; octaves: number }>();
  /** Hairpins not yet closed, by their number. */
  private readonly openHairpins = new Map<string, { start: number; type: Hairpin['type']; below: boolean }>();
  private readonly pedalState: PedalState = { sustain: false, sustainPrinted: false, sostenuto: null, sostenutoLast: false };

  // What has been read.
  private readonly bars: { start: number; length: number; navigation: MutableNavigation }[] = [];
  private readonly notes: WrittenNote[] = [];
  private readonly rests: WrittenRest[] = [];
  private readonly graces: WrittenGraces[] = [];
  private readonly clefChanges: ClefChange[] = [];
  private readonly timeSignatures: TimeSignature[] = [];
  private readonly keySignatures: KeySignature[] = [];
  private readonly tempos: TempoChange[] = [];
  /** `printed`: from a <metronome>; otherwise worked out from a <sound tempo>, in quarters. */
  private readonly tempoMarks: (TempoMark & { printed: boolean })[] = [];
  private readonly pedalMoves: PedalMove[] = [];
  private readonly pedalMarks: PedalMark[] = [];
  private readonly octaveShifts: OctaveShift[] = [];
  private readonly dynamicLevels: DynamicLevel[] = [];
  private readonly dynamicMarks: DynamicMark[] = [];
  private readonly hairpins: Hairpin[] = [];

  private bar: OpenBar = this.openBar();

  constructor(private readonly title: string) {}

  read(part: Element): Notation {
    for (const measure of part.querySelectorAll(':scope > measure')) this.readMeasure(measure);

    // A shift or a hairpin the file never stops ends with the music.
    for (const [staff, open] of this.openShifts) this.octaveShifts.push({ staff, start: open.start, end: this.barStart, octaves: open.octaves });
    for (const open of this.openHairpins.values()) this.hairpins.push({ ...open, end: this.barStart, drawn: true });

    return {
      title: this.title,
      bars: this.bars,
      notes: this.notes,
      graces: this.graces,
      rests: this.rests,
      clefs: this.clefChanges,
      keySignatures: this.keySignatures,
      timeSignatures: this.timeSignatures,
      tempos: this.tempos,
      tempoMarks: this.tempoMarks,
      pedalMoves: this.pedalMoves,
      pedalMarks: this.pedalMarks,
      octaveShifts: this.octaveShifts,
      dynamics: this.dynamicMarks,
      hairpins: this.hairpins,
      dynamicLevels: this.dynamicLevels,
    };
  }

  private openBar(): OpenBar {
    const navigation: MutableNavigation = {};
    if (this.ending) navigation.ending = this.ending.numbers;
    return { index: this.bars.length, navigation, endingEndsHere: false, cursor: 0, longest: 0, lastStart: 0, graces: [] };
  }

  private readMeasure(measure: Element): void {
    this.bar = this.openBar();
    const { bar } = this;
    for (const element of measure.children) {
      switch (element.nodeName) {
        case 'attributes':
          this.readAttributes(element);
          break;
        case 'barline':
          this.readBarline(element);
          break;
        case 'direction':
        case 'sound':
          this.readDirection(element);
          break;
        case 'backup':
          this.attachGraces(false);
          bar.cursor -= childNumber(element, 'duration') ?? 0;
          break;
        case 'forward':
          this.attachGraces(false);
          bar.cursor += childNumber(element, 'duration') ?? 0;
          bar.longest = Math.max(bar.longest, bar.cursor);
          break;
        case 'note':
          if (element.querySelector(':scope > grace')) this.readGrace(element);
          else this.readNote(element);
          break;
      }
    }

    // Grace notes after the bar's last note stand before the bar line.
    this.attachGraces(false);

    // Files do not always close the last volta. A new ‖: never sits inside one, so it closes it.
    if (bar.navigation.repeatStart && this.ending && !bar.navigation.endingLabel) {
      delete bar.navigation.ending;
      this.ending = null;
    }

    // A pickup bar is shorter than its time signature says; trust what the measure contains.
    const nominal = (this.timeSignature.numerator * 4) / this.timeSignature.denominator;
    const length = bar.longest > 0 ? bar.longest / this.divisions : nominal;
    this.bars.push({ start: this.barStart, length, navigation: bar.navigation });
    this.barStart += length;
    if (bar.endingEndsHere) this.ending = null;
  }

  /** The beat along the page of a position inside the bar being read (in divisions). */
  private beatAt(position: number): number {
    return this.barStart + position / this.divisions;
  }

  /** <attributes>: divisions, the number of staves, the key, the clefs, the time signature. */
  private readAttributes(element: Element): void {
    const beat = () => this.beatAt(this.bar.cursor);
    this.divisions = childNumber(element, 'divisions') ?? this.divisions;
    this.staves = childNumber(element, 'staves') ?? this.staves;

    const key = element.querySelector(':scope > key');
    const fifths = key && childNumber(key, 'fifths');
    if (key && fifths !== null) {
      this.keySignatures.push({ beat: beat(), fifths, minor: childText(key, 'mode') === 'minor' });
    }

    for (const clef of element.querySelectorAll(':scope > clef')) {
      const sign = childText(clef, 'sign');
      if (sign !== 'G' && sign !== 'F') continue; // C clefs are rare in piano music
      const staff = Number(clef.getAttribute('number') ?? 1);
      const value: Clef = sign === 'G' ? 'treble' : 'bass';
      this.clefs.set(staff, value);
      this.clefChanges.push({ staff, beat: beat(), clef: value });
    }

    const time = element.querySelector(':scope > time');
    const numerator = time && childNumber(time, 'beats');
    const denominator = time && childNumber(time, 'beat-type');
    if (numerator && denominator) {
      this.timeSignature = { beat: beat(), numerator, denominator };
      this.timeSignatures.push(this.timeSignature);
    }
  }

  /** <barline>: repeat signs and voltas. */
  private readBarline(element: Element): void {
    const nav = this.bar.navigation;
    const repeat = element.querySelector(':scope > repeat');
    if (repeat?.getAttribute('direction') === 'forward') nav.repeatStart = true;
    if (repeat?.getAttribute('direction') === 'backward') {
      nav.repeatEnd = { times: Number(repeat.getAttribute('times') ?? 2) || 2 };
    }

    const ending = element.querySelector(':scope > ending');
    if (!ending) return;
    const numbers = (ending.getAttribute('number') ?? '1')
      .split(/[,\s]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0);
    const type = ending.getAttribute('type');
    if (type === 'start') {
      this.ending = { numbers, label: ending.textContent?.trim() || `${numbers.join(', ')}.` };
      nav.ending = numbers;
      nav.endingLabel = this.ending.label;
    } else if (type === 'stop' || type === 'discontinue') {
      nav.ending ??= numbers;
      nav.endingClosed = type === 'stop';
      this.bar.endingEndsHere = true;
    }
  }

  /** <direction> or a <sound> of its own: tempo, jumps, pedals, dynamics, octave shifts. */
  private readDirection(element: Element): void {
    const { cursor, index: bar } = this.bar;
    const isDirection = element.nodeName === 'direction';
    const sound = isDirection ? element.querySelector(':scope > sound') : element;
    // A direction may sit before the note it belongs to, shifted by its <offset>; a <sound> may
    // carry one of its own.
    const offset = isDirection ? (childNumber(element, 'offset') ?? 0) : 0;
    const beat = this.beatAt(cursor + offset);
    const soundBeat = this.beatAt(cursor + ((sound && childNumber(sound, 'offset')) ?? offset));

    const tempo = Number(sound?.getAttribute('tempo'));
    if (tempo > 0) this.tempos.push({ bar, beat: soundBeat, bpm: tempo });
    const mark = isDirection ? metronomeMark(element, beat) : null;
    if (mark) this.tempoMarks.push({ ...mark, printed: true });
    else if (tempo > 0) {
      this.tempoMarks.push({ beat: soundBeat, unit: { value: 'quarter', dots: 0 }, perMinute: Math.round(tempo), printed: false });
    }

    readNavigation(element, sound, this.bar.navigation);

    const pedal = readPedal(element, sound, beat, this.pedalState);
    this.pedalMoves.push(...pedal.events.map((event) => ({ bar, ...event })));
    this.pedalMarks.push(...pedal.marks);

    const level = Number(sound?.getAttribute('dynamics'));
    if (isDirection) {
      const dynamics = readDynamics(element, beat, level > 0 ? level : null, this.openHairpins);
      this.dynamicMarks.push(...dynamics.marks);
      this.hairpins.push(...dynamics.hairpins);
      // A level with no mark printed for it.
      if (level > 0 && dynamics.marks.length === 0) this.dynamicLevels.push({ beat, level });
    } else if (level > 0) {
      this.dynamicLevels.push({ beat: this.beatAt(cursor), level });
    }

    const shift = element.querySelector(':scope > direction-type > octave-shift');
    if (shift) this.readOctaveShift(shift, childNumber(element, 'staff') ?? 1, beat);
  }

  /** <octave-shift>: the start or the end of an 8va (8vb, 15ma…) bracket on a staff. */
  private readOctaveShift(shift: Element, staff: number, beat: number): void {
    const type = shift.getAttribute('type');
    const open = this.openShifts.get(staff);
    if (open && (type === 'stop' || type === 'up' || type === 'down')) {
      this.octaveShifts.push({ staff, start: open.start, end: beat, octaves: open.octaves });
      this.openShifts.delete(staff);
    }
    // 8 is an octave, 15 two, 22 three. "down": printed lower than played, as under 8va.
    const octaves = Math.max(1, Math.round((Number(shift.getAttribute('size') ?? 8) - 1) / 7));
    if (type === 'up' || type === 'down') this.openShifts.set(staff, { start: beat, octaves: type === 'down' ? octaves : -octaves });
  }

  /** The staff a <note> is on, with the hand that plays it and the clef it is read in. */
  private placeOf(note: Element): { staff: number; hand: Hand; clef: Clef } {
    const staff = childNumber(note, 'staff') ?? 1;
    return {
      staff,
      hand: this.staves > 1 && staff > 1 ? 'left' : 'right',
      clef: this.clefs.get(staff) ?? (staff > 1 ? 'bass' : 'treble'),
    };
  }

  /** A <note> with a <grace>: a small note with no time of its own, kept until the note it leads to is read. */
  private readGrace(element: Element): void {
    const pitch = element.querySelector(':scope > pitch');
    if (!pitch) return;
    const place = this.placeOf(element);
    const read = readWritten(element, pitch, { ...place, isChord: false, beat: 0, beats: 0, ties: [] });
    // <pitch> is what sounds; under an octave shift the note is printed octaves away from it.
    const shiftBy = this.openShifts.get(place.staff)?.octaves ?? 0;
    this.bar.graces.push({
      ...place,
      pitch: { ...read.pitch, octave: read.pitch.octave - shiftBy },
      accidental: read.accidental,
      chord: element.querySelector(':scope > chord') !== null,
      slash: element.querySelector(':scope > grace')!.getAttribute('slash') === 'yes',
      // Without <type>, an eighth: what a lone grace note usually is.
      value: NOTE_TYPES[childText(element, 'type') ?? ''] ?? 'eighth',
      slur: read.slurs.some((slur) => slur.type === 'start'),
      sounding: midiPitch(pitch),
    });
  }

  /** A <note> with a length: a note, one more note of a chord, or a rest. Moves the reading on. */
  private readNote(element: Element): void {
    const { bar } = this;
    const duration = childNumber(element, 'duration') ?? 0;
    const isChord = element.querySelector(':scope > chord') !== null;
    const start = isChord ? bar.lastStart : bar.cursor;
    const rest = element.querySelector(':scope > rest');
    const pitch = element.querySelector(':scope > pitch');
    if (!isChord) {
      this.attachGraces(!rest && pitch !== null);
      bar.lastStart = bar.cursor;
      bar.cursor += duration;
      bar.longest = Math.max(bar.longest, bar.cursor);
    }
    const beat = this.beatAt(start);
    const beats = duration / this.divisions;

    if (rest) {
      const staff = childNumber(element, 'staff') ?? 1;
      this.rests.push(readRest(element, rest, { staff, clef: this.clefs.get(staff) ?? 'treble', beat, beats }));
      return;
    }
    if (!pitch) return; // an unpitched note

    const place = this.placeOf(element);
    const ties = [...element.querySelectorAll(':scope > tie')].map((tie) => tie.getAttribute('type'));
    const written = readWritten(element, pitch, { ...place, isChord, beat, beats, ties });
    // <pitch> is what sounds; under an octave shift the note is printed octaves away from it.
    const shiftBy = this.openShifts.get(place.staff)?.octaves ?? 0;
    const ownDynamics = Number(element.getAttribute('dynamics'));
    this.notes.push({
      ...written,
      pitch: shiftBy ? { ...written.pitch, octave: written.pitch.octave - shiftBy } : written.pitch,
      bar: bar.index,
      sounding: midiPitch(pitch),
      dynamics: ownDynamics > 0 ? ownDynamics : null,
    });
  }

  /**
   * The grace notes read so far stand before the place the reading is at: they lead to the note
   * about to be read there (`toNextNote`), or to none (after the bar's last note, before a rest).
   */
  private attachGraces(toNextNote: boolean): void {
    const { bar } = this;
    if (bar.graces.length === 0) return;
    this.graces.push({ bar: bar.index, beat: this.beatAt(bar.cursor), leadsTo: toNextNote ? this.notes.length : null, notes: bar.graces });
    bar.graces = [];
  }
}
