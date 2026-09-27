import { describe, expect, it } from 'vitest';
import type { Hand, Note } from '../src/domain/note';
import { pitch } from '../src/domain/pitch';
import { createScore, type KeySignature } from '../src/domain/score';
import { odeToJoy } from '../src/demo/odeToJoy';
import { spell } from '../src/domain/notation/spelling';
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
