import { describe, expect, it } from 'vitest';
import type { Hand, Note } from '../src/domain/note';
import { pitch } from '../src/domain/pitch';
import { createScore, type KeySignature } from '../src/domain/score';
import { odeToJoy } from '../src/demo/odeToJoy';
import { spell } from '../src/domain/notation/spelling';
import type { WrittenNote, WrittenRest } from '../src/domain/notation/written';
import { layoutNotation, ledgerSteps, staffFor } from '../src/infrastructure/render/notationLayout';

const chordsOf = (score: Parameters<typeof layoutNotation>[0]) => layoutNotation(score).chords;

/** 60 BPM: one beat per second. Bars of 4/4. */
const note = (midi: number, beat: number, beats: number, hand: Hand = 'right'): Note => ({
  pitch: midi,
  start: beat,
  duration: beats,
  beat,
  beats,
  velocity: 1,
  hand,
});

const scoreOf = (notes: Note[], keySignatures: KeySignature[] = []) =>
  createScore('test', notes, [0, 4, 8], { barBeats: [0, 4, 8], keySignatures });

describe('layoutNotation', () => {
  it('puts the right hand on the treble staff and the left on the bass staff', () => {
    const [treble, bass] = chordsOf(scoreOf([note(pitch('Mi', 4), 0, 1), note(pitch('Do', 3), 1, 1, 'left')]));
    expect(treble).toMatchObject({ staff: 'treble', notes: [{ step: 8 }] }); // Mi4: bottom line
    expect(bass).toMatchObject({ staff: 'bass', notes: [{ step: 5 }] }); // Do3: space under the middle line
  });

  it('places notes along the bar by their beat', () => {
    const chords = chordsOf(scoreOf([note(60, 0, 1), note(62, 2, 1), note(64, 5, 1)]));
    expect(chords.map((c) => c.x)).toEqual([0, 0.5, 1.25]);
  });

  it('shares one stem between notes that start together', () => {
    const [chord] = chordsOf(scoreOf([note(pitch('Do', 3), 0, 4, 'left'), note(pitch('Sol', 3), 0, 4, 'left')]));
    expect(chord.notes.map((n) => n.step)).toEqual([1, 5]); // Sol3 in the top space, Do3 under the middle line
    expect(chord.duration).toEqual({ value: 'whole', dots: 0 });
  });

  it('points stems away from the side the notes are on', () => {
    const [low, high, middle] = chordsOf(
      scoreOf([note(pitch('Mi', 4), 0, 1), note(pitch('La', 5), 1, 1), note(pitch('Si', 4), 2, 1)]),
    );
    expect(low.stemUp).toBe(true);
    expect(high.stemUp).toBe(false);
    expect(middle.stemUp).toBe(false); // on the middle line: down, by convention
  });

  it('adds ledger lines for notes beyond the staff', () => {
    const [middleDo] = chordsOf(scoreOf([note(pitch('Do', 4), 0, 1)]));
    expect(middleDo.ledgerSteps).toEqual([10]);
    expect(ledgerSteps(-5, 4)).toEqual([-2, -4]);
  });

  it('prints accidentals once per bar and again in the next bar', () => {
    const chords = chordsOf(scoreOf([note(pitch('Fa#', 4), 0, 1), note(pitch('Fa#', 4), 1, 1), note(pitch('Fa#', 4), 4, 1)]));
    expect(chords.map((c) => c.notes[0].accidental)).toEqual(['sharp', null, 'sharp']);
  });

  it('respects the key signature', () => {
    const inSolMajor = [{ beat: 0, fifths: 1, minor: false }];
    const chords = chordsOf(scoreOf([note(pitch('Fa#', 4), 0, 1), note(pitch('Fa', 4), 1, 1)], inSolMajor));
    expect(chords.map((c) => c.notes[0].accidental)).toEqual([null, 'natural']);
  });

  it('lays out the Ode to Joy demo cleanly', () => {
    const chords = chordsOf(odeToJoy('Ode'));
    const melody = chords.filter((c) => c.staff === 'treble');
    expect(melody).toHaveLength(30);
    expect(melody.every((c) => c.notes.every((n) => n.accidental === null))).toBe(true); // Do major, no accidentals
    expect(melody[12].duration).toEqual({ value: 'quarter', dots: 1 }); // the dotted Mi at the end of the phrase
  });

  it('beams the eighths of one beat and gives them a common stem direction', () => {
    // Mi4 (low, stem up alone) and La5 (high, stem down alone) in one beat: one beam, stems down.
    const { chords, beams } = layoutNotation(scoreOf([note(pitch('Mi', 4), 0, 0.5), note(pitch('La', 5), 0.5, 0.5)]));
    expect(beams).toEqual([{ chords: [0, 1], stemUp: false }]);
    expect(chords.map((c) => [c.beam, c.stemUp])).toEqual([
      [0, false],
      [0, false],
    ]);
  });
});

describe('staffFor', () => {
  const on = (hand: Hand, name: Parameters<typeof pitch>[0], octave: number) => staffFor(hand, spell(pitch(name, octave), 0));

  it('keeps each hand on its own staff normally', () => {
    expect(on('right', 'Sol', 4)).toBe('treble');
    expect(on('left', 'Do', 3)).toBe('bass');
  });

  it('allows up to two ledger lines before moving', () => {
    expect(on('left', 'Mi', 4)).toBe('bass'); // two ledger lines above the bass staff
    expect(on('right', 'La', 3)).toBe('treble'); // two ledger lines below the treble staff
  });

  it('writes a note on the other staff when the hands cross far', () => {
    expect(on('left', 'Mi', 5)).toBe('treble'); // Für Elise, bar 14: the left hand plays high
    expect(on('right', 'Mi', 3)).toBe('bass');
  });

  it('keeps the colour of the hand that plays it', () => {
    const [chord] = layoutNotation(scoreOf([note(pitch('Mi', 5), 0, 1, 'left')])).chords;
    expect(chord).toMatchObject({ staff: 'treble', hand: 'left' });
  });
});

describe('hands crossing onto the other staff', () => {
  // Für Elise, bar 14 in miniature: Mi5 and Re♯5 alternating between the hands, in sixteenths.
  const crossing = scoreOf([
    note(pitch('Mi', 5), 0, 0.25, 'left'),
    note(pitch('Mi', 5), 0.25, 0.25, 'right'),
    note(pitch('Re#', 5), 0.5, 0.25, 'left'),
    note(pitch('Mi', 5), 0.75, 0.25, 'right'),
  ]);
  const { chords, beams } = layoutNotation(crossing);

  it('writes both hands on the treble staff as two voices: right stems up, left stems down', () => {
    expect(chords.every((c) => c.staff === 'treble')).toBe(true);
    expect(chords.map((c) => [c.hand, c.stemUp])).toEqual([
      ['left', false],
      ['right', true],
      ['left', false],
      ['right', true],
    ]);
  });

  it('beams each hand separately', () => {
    expect(beams.map((b) => b.chords.map((i) => chords[i].hand))).toEqual(
      expect.arrayContaining([
        ['left', 'left'],
        ['right', 'right'],
      ]),
    );
  });

  it('marks the hand once, where it moves to the other staff', () => {
    expect(chords.map((c) => c.handMark)).toEqual([true, false, false, false]);
  });

  it('marks it again after the hand has gone home and comes back', () => {
    const { chords: back } = layoutNotation(
      scoreOf([note(pitch('Mi', 5), 0, 1, 'left'), note(pitch('Do', 3), 1, 1, 'left'), note(pitch('Mi', 5), 2, 1, 'left')]),
    );
    expect(back.map((c) => [c.staff, c.handMark])).toEqual([
      ['treble', true],
      ['bass', false],
      ['treble', true],
    ]);
  });
});

describe('layout of printed notes (MusicXML)', () => {
  const printed = (overrides: Partial<WrittenNote> & Pick<WrittenNote, 'beat'>): WrittenNote => ({
    staff: 1,
    voice: '1',
    hand: 'right',
    chord: false,
    clef: 'treble',
    pitch: { letter: 0, octave: 5, alteration: 0 },
    start: overrides.beat,
    end: overrides.beat + 1 / 3,
    duration: { value: 'eighth', dots: 0 },
    tuplet: { actual: 3, normal: 2 },
    tupletStart: null,
    tupletStop: false,
    accidental: null,
    stem: 'up',
    beams: [],
    tieStart: false,
    tieStop: false,
    articulations: [],
    fermata: null,
    slurs: [],
    ...overrides,
  });
  const written = [
    printed({ beat: 0, beams: ['begin'], tupletStart: { showNumber: true, bracket: null } }),
    printed({ beat: 1 / 3, beams: ['continue'], accidental: 'sharp' }),
    printed({ beat: 2 / 3, beams: ['end'], tupletStop: true }),
    // A treble clef on the lower staff: Mi5 sits in the top space, not on ledger lines.
    printed({ beat: 1, staff: 2, hand: 'left', clef: 'treble', pitch: { letter: 2, octave: 5, alteration: 0 }, tuplet: null }),
  ];
  const withWritten = createScore('test', [note(60, 0, 2)], [0, 4], { barBeats: [0, 4], written });
  const layout = layoutNotation(withWritten);

  it('draws what is written instead of guessing', () => {
    expect(layout.chords[0].duration).toEqual({ value: 'eighth', dots: 0 });
    expect(layout.chords[1].notes[0].accidental).toBe('sharp');
  });

  it('beams as the file says', () => {
    expect(layout.beams).toEqual([{ chords: [0, 1, 2], stemUp: true }]);
  });

  it('marks tuplets, without a bracket when the group is one beam', () => {
    expect(layout.tuplets).toEqual([{ chords: [0, 1, 2], number: 3, showNumber: true, bracket: false, above: true }]);
  });

  it('places pitches by the clef in force, on the staff they are written on', () => {
    const lower = layout.chords[3];
    expect(lower).toMatchObject({ staff: 'bass', notes: [{ step: 1 }], ledgerSteps: [] });
  });
});

describe('rests and ties (MusicXML)', () => {
  const base: WrittenNote = {
    staff: 1,
    voice: '1',
    hand: 'right',
    chord: false,
    clef: 'treble',
    pitch: { letter: 4, octave: 4, alteration: 0 }, // Sol4
    beat: 0,
    start: 0,
    end: 2,
    duration: { value: 'half', dots: 0 },
    tuplet: null,
    tupletStart: null,
    tupletStop: false,
    accidental: null,
    stem: 'up',
    beams: [],
    tieStart: false,
    tieStop: false,
    articulations: [],
    fermata: null,
    slurs: [],
  };
  const rest = (overrides: Partial<WrittenRest>): WrittenRest => ({
    staff: 1,
    voice: '1',
    beat: 0,
    duration: { value: 'quarter', dots: 0 },
    measure: false,
    displayPitch: null,
    clef: 'treble',
    ...overrides,
  });
  const scoreWith = (written: WrittenNote[], rests: WrittenRest[]) =>
    createScore('test', [note(60, 0, 8)], [0, 4], { barBeats: [0, 4], written, rests });

  it('ties a note to the next one of the same pitch, curving away from the stem', () => {
    const { ties } = layoutNotation(
      scoreWith([{ ...base, tieStart: true }, { ...base, beat: 2, start: 2, tieStop: true }], []),
    );
    expect(ties).toEqual([{ from: 0, to: 1, step: 6, above: false }]); // Sol4 on the second line; stem up → tie below
  });

  it('ties across a bar line', () => {
    const { ties } = layoutNotation(
      scoreWith([{ ...base, beat: 2, start: 2, tieStart: true }, { ...base, beat: 4, start: 4, tieStop: true }], []),
    );
    expect(ties).toHaveLength(1);
  });

  it('places rests on the middle line, and a whole rest under the fourth line', () => {
    const { rests } = layoutNotation(
      scoreWith([base], [rest({ beat: 2 }), rest({ beat: 4, duration: { value: 'whole', dots: 0 } })]),
    );
    expect(rests.map((r) => r.step)).toEqual([4, 2]);
  });

  it('moves rests out of the way when two voices share the staff', () => {
    const { rests } = layoutNotation(scoreWith([base], [rest({ beat: 2, voice: '2' })]));
    expect(rests[0].step).toBe(8); // the lower voice's rest goes down
  });

  it('centres a whole-bar rest in its bar', () => {
    const { rests } = layoutNotation(scoreWith([base], [rest({ beat: 4, measure: true })]));
    expect(rests[0]).toMatchObject({ x: 1.5, duration: { value: 'whole', dots: 0 } });
  });

  it('uses the placement from the file when there is one', () => {
    const { rests } = layoutNotation(scoreWith([base], [rest({ beat: 2, displayPitch: { letter: 1, octave: 5 } })]));
    expect(rests[0].step).toBe(2); // Re5: the fourth line from the bottom
  });
});

describe('articulations and slurs (MusicXML)', () => {
  const at = (beat: number, pitch: WrittenNote['pitch'], overrides: Partial<WrittenNote> = {}): WrittenNote => ({
    staff: 1,
    voice: '1',
    hand: 'right',
    chord: false,
    clef: 'treble',
    pitch,
    beat,
    start: beat,
    end: beat + 1,
    duration: { value: 'quarter', dots: 0 },
    tuplet: null,
    tupletStart: null,
    tupletStop: false,
    accidental: null,
    stem: null,
    beams: [],
    tieStart: false,
    tieStop: false,
    articulations: [],
    fermata: null,
    slurs: [],
    ...overrides,
  });
  const Sol4 = { letter: 4, octave: 4, alteration: 0 } as const; // second line: step 6
  const layoutOf = (written: WrittenNote[]) =>
    layoutNotation(createScore('test', [note(60, 0, 4)], [0], { barBeats: [0], written }));

  it('moves a staccato dot off a line into the next space', () => {
    // Sol4 has its stem up, so the dot goes below: one space down is step 8, a line, so it moves to 9.
    const { marks } = layoutOf([at(0, Sol4, { articulations: ['staccato'] })]);
    expect(marks).toEqual([{ chord: 0, kind: 'staccato', above: false, step: 9 }]);
  });

  it('puts articulations on the stem side when two voices share the staff', () => {
    const { marks } = layoutOf([
      at(0, Sol4, { articulations: ['accent'], stem: 'up' }),
      at(0, { letter: 0, octave: 4, alteration: 0 }, { voice: '2', stem: 'down' }),
    ]);
    const accent = marks.find((m) => m.kind === 'accent')!;
    expect(accent.above).toBe(true);
    expect(accent.step).toBeLessThan(6 - 7); // beyond the end of the upward stem
  });

  it('keeps a fermata outside the staff', () => {
    const { marks } = layoutOf([at(0, Sol4, { fermata: 'upright' })]);
    expect(marks[0]).toMatchObject({ kind: 'fermata', above: true });
    expect(marks[0].step).toBeLessThan(0);
  });

  it('follows the slur placement given in the file', () => {
    const { slurs } = layoutOf([
      at(0, Sol4, { slurs: [{ type: 'start', number: 1, placement: 'above' }] }),
      at(1, Sol4),
      at(2, Sol4, { slurs: [{ type: 'stop', number: 1, placement: null }] }),
    ]);
    expect(slurs).toEqual([{ from: 0, to: 2, above: true, between: [1] }]);
  });

  it('puts a slur under the noteheads when all stems point up', () => {
    const { slurs } = layoutOf([
      at(0, Sol4, { slurs: [{ type: 'start', number: 1, placement: null }] }),
      at(1, Sol4, { slurs: [{ type: 'stop', number: 1, placement: null }] }),
    ]);
    expect(slurs[0].above).toBe(false);
  });
});
