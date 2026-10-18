import { describe, expect, it } from 'vitest';
import { accidentalsInColumns, reachOf, restsClearOfNotes, shiftVoicesApart, untangleVoices, withDots, type StaffChord } from '../src/domain/notation/engraving';


describe('shiftVoicesApart', () => {
  const chord = (steps: number[], stemUp: boolean, beat = 0) =>
    ({
      staff: 'treble',
      hand: 'right',
      beat,
      beats: 1,
      bar: 0,
      beam: null,
      handMark: false,
      notes: steps.map((step) => ({ step, accidental: null })),
      duration: { value: 'quarter', dots: 0 },
      stemUp,
      ledgerSteps: [],
    }) satisfies StaffChord;

  it('moves the up-stem voice right when the voices meet a second apart', () => {
    const shifted = shiftVoicesApart([chord([4], true), chord([5], false)]);
    expect(shifted.map((c) => !!c.voiceShift)).toEqual([true, false]);
  });

  it('leaves voices a third apart, or not starting together, where they are', () => {
    expect(shiftVoicesApart([chord([4], true), chord([6], false)]).some((c) => c.voiceShift)).toBe(false);
    expect(shiftVoicesApart([chord([4], true), chord([5], false, 1)]).some((c) => c.voiceShift)).toBe(false);
  });
});

describe('two voices on one note', () => {
  const chord = (step: number, stemUp: boolean, value: 'half' | 'quarter' | 'eighth', dots: 0 | 1 = 0) =>
    ({
      staff: 'treble',
      hand: 'right',
      beat: 0,
      beats: 1,
      bar: 0,
      beam: null,
      handMark: false,
      notes: [{ step, accidental: null }],
      duration: { value, dots },
      stemUp,
      ledgerSteps: [],
    }) satisfies StaffChord;

  it('share one head when their heads are alike: two quarters, a quarter and an eighth', () => {
    expect(shiftVoicesApart([chord(4, true, 'quarter'), chord(4, false, 'quarter')]).some((c) => c.voiceShift)).toBe(false);
    expect(shiftVoicesApart([chord(4, true, 'quarter'), chord(4, false, 'eighth')]).some((c) => c.voiceShift)).toBe(false);
  });

  it('stand side by side when one head is open and the other black: the down-stem voice to the right', () => {
    const [up, down] = shiftVoicesApart([chord(4, true, 'half'), chord(4, false, 'quarter')]);
    expect([!!up.voiceShift, !!down.voiceShift]).toEqual([false, true]);
    const [down2, up2] = shiftVoicesApart([chord(4, false, 'half'), chord(4, true, 'quarter')]);
    expect([!!down2.voiceShift, !!up2.voiceShift]).toEqual([true, false]);
  });

  it('stand side by side when one is dotted and the other is not; the dots of the one that stays go past the other’s head', () => {
    const [up, down] = shiftVoicesApart([chord(4, true, 'quarter', 1), chord(4, false, 'quarter')]);
    expect(down.voiceShift).toBe(true);
    expect(up.dotsPastVoice).toBe(true);
    expect(down.dotsPastVoice).toBeUndefined();
  });
});

describe('accidentals of what starts together', () => {
  const chord = (notes: [step: number, sharp: boolean][], beat = 0, staff: 'treble' | 'bass' = 'treble') =>
    ({
      staff,
      hand: 'right',
      beat,
      beats: 1,
      bar: 0,
      beam: null,
      handMark: false,
      notes: notes.map(([step, sharp]) => ({ step, accidental: sharp ? ('sharp' as const) : null })),
      duration: { value: 'quarter', dots: 0 },
      stemUp: true,
      ledgerSteps: [],
    }) satisfies StaffChord;
  const columns = (chords: StaffChord[]) => accidentalsInColumns(chords).map((c) => c.notes.map((note) => (note.accidental ? (note.accidentalColumn ?? 0) : null)));

  it('stand in one column when they are far enough apart on the staff: a sixth or more', () => {
    expect(columns([chord([[0, true], [6, true]])])).toEqual([[0, 0]]);
    expect(columns([chord([[0, true], [3, false], [7, true]])])).toEqual([[0, null, 0]]);
  });

  it('stand in columns when they are close: the upper one next to the heads, the lower one a column out', () => {
    expect(columns([chord([[2, true], [4, true]])])).toEqual([[0, 1]]);
  });

  it('use as few columns as will do: of three close together, the third stands under the first again when it is far enough from it', () => {
    expect(columns([chord([[0, true], [2, true], [6, true]])])).toEqual([[0, 1, 0]]);
    expect(columns([chord([[0, true], [2, true], [4, true]])])).toEqual([[0, 1, 2]]);
  });

  it('are set as one for two voices of one moment on one staff, and apart for another moment or the other staff', () => {
    expect(columns([chord([[2, true]]), chord([[4, true]])])).toEqual([[0], [1]]);
    expect(columns([chord([[2, true]]), chord([[4, true]], 1)])).toEqual([[0], [0]]);
    expect(columns([chord([[2, true]]), chord([[4, true]], 0, 'bass')])).toEqual([[0], [0]]);
  });
});

describe('the dots of a dotted chord', () => {
  const chord = (steps: number[], dots: 0 | 1 = 1) =>
    ({
      staff: 'treble',
      hand: 'right',
      beat: 0,
      beats: 1.5,
      bar: 0,
      beam: null,
      handMark: false,
      notes: steps.map((step) => ({ step, accidental: null })),
      duration: { value: 'quarter', dots },
      stemUp: true,
      ledgerSteps: [],
    }) satisfies StaffChord;
  const dotSteps = (c: StaffChord) => withDots(c).notes.map((note) => note.dotStep ?? null);

  it('stand where they would by themselves when the notes are apart: nothing is said', () => {
    expect(dotSteps(chord([1, 5]))).toEqual([null, null]);
    expect(dotSteps(chord([2, 6]))).toEqual([null, null]);
  });

  it('do not share a space: a note on a line under a note in the space above it has its dot in the space below', () => {
    // The note in space 3 has its dot there; the note on line 4 would put its dot there too.
    expect(dotSteps(chord([3, 4]))).toEqual([null, 5]);
  });

  it('are left alone on a chord that is not dotted', () => {
    expect(dotSteps(chord([3, 4], 0))).toEqual([null, null]);
  });
});

describe('a rest where another voice has notes', () => {
  const chord = (steps: number[], beat = 0, stemUp = true) =>
    ({
      staff: 'treble',
      hand: 'right',
      beat,
      beats: 1,
      bar: 0,
      beam: null,
      handMark: false,
      notes: steps.map((step) => ({ step, accidental: null })),
      duration: { value: 'quarter', dots: 0 },
      stemUp,
      ledgerSteps: [],
    }) satisfies StaffChord;
  const rest = (step: number, beat = 0, staff: 'treble' | 'bass' = 'treble') => ({ staff, beat, step, duration: { value: 'quarter' as const, dots: 0 as const } });
  const steps = (rests: ReturnType<typeof rest>[], chords: StaffChord[]) => restsClearOfNotes(rests, chords).map((r) => r.step);

  it('stands two spaces clear of them, on the side their stems do not go to', () => {
    // Stems up: the notes are the upper voice, the rest the lower one's.
    expect(steps([rest(4)], [chord([4, 6])])).toEqual([10]);
    expect(steps([rest(4)], [chord([4, 6], 0, false)])).toEqual([0]);
  });

  it('stays where it is when it is clear of them already, or they are at another moment or on the other staff', () => {
    expect(steps([rest(0)], [chord([6])])).toEqual([0]);
    expect(steps([rest(4)], [chord([4], 1)])).toEqual([4]);
    expect(steps([rest(4, 0, 'bass')], [chord([4])])).toEqual([4]);
  });
});

describe('how far a piece reaches beyond its staves', () => {
  const chord = (steps: number[], staff: 'treble' | 'bass', stemUp: boolean, value: 'quarter' | 'whole' = 'quarter') =>
    ({
      staff,
      hand: 'right',
      beat: 0,
      beats: 1,
      bar: 0,
      beam: null,
      handMark: false,
      notes: steps.map((step) => ({ step, accidental: null })),
      duration: { value, dots: 0 },
      stemUp,
      ledgerSteps: [],
    }) satisfies StaffChord;
  const EMPTY = { octaveShifts: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [], graces: [], ornaments: [], tremolos: [], arpeggios: [], fingerings: [] };
  const reach = (chords: StaffChord[], has?: { pedal?: boolean; words?: boolean; dynamics?: boolean }) => reachOf({ ...EMPTY, chords }, has);

  it('is no more than the room there always is, for music within the staves and a little beyond', () => {
    // In steps: ten of them are the five spaces a staff always has over and under it.
    const { above, below } = reach([chord([0, 4], 'treble', true), chord([-3], 'treble', false), chord([8], 'bass', false)]);
    expect(above).toBeLessThanOrEqual(10);
    expect(below).toBeLessThanOrEqual(10);
  });

  it('grows with the highest note of the upper staff and the lowest of the lower one, room for signs beyond them counted in', () => {
    expect(reach([chord([-8], 'treble', false)]).above).toBe(15);
    expect(reach([chord([16], 'bass', true)]).below).toBe(15);
    // The upper staff's low notes and the lower staff's high ones are between the staves: no matter here.
    expect(reach([chord([14], 'treble', true), chord([-6], 'bass', false)])).toEqual({ above: 0, below: 0 });
  });

  it('counts a stem that points outwards', () => {
    expect(reach([chord([-2], 'treble', true)]).above).toBe(12);
    expect(reach([chord([-2], 'treble', true, 'whole')]).above).toBe(9);
  });

  it('is more under a piece with the pedal or dynamics, and over one with words', () => {
    const low = [chord([16], 'bass', true)];
    expect(reach(low, { pedal: true }).below).toBe(reach(low).below + 5);
    expect(reach(low, { pedal: true, dynamics: true }).below).toBe(reach(low).below + 8);
    const high = [chord([-8], 'treble', false)];
    expect(reach(high, { words: true }).above).toBe(reach(high).above + 2);
  });
});

describe('untangleVoices', () => {
  const chord = (steps: number[], stemUp: boolean, beat: number, beam: number | null = null) =>
    ({
      staff: 'bass',
      hand: 'left',
      beat,
      beats: 1 / 3,
      bar: 0,
      beam,
      handMark: false,
      notes: steps.map((step) => ({ step, accidental: null })),
      duration: { value: 'eighth', dots: 0 },
      stemUp,
      ledgerSteps: [],
    }) satisfies StaffChord;

  it('turns round a stem-down group standing wholly above a stem-up one, and that one too', () => {
    // As in the Moonlight Sonata, bar 63: a triplet high in the bass (stems down) over a low G♯ (stems up).
    const chords = [chord([0], false, 3, 0), chord([1], false, 3 + 1 / 3, 0), chord([2], false, 3 + 2 / 3, 0), chord([8], true, 3)];
    const beams = [{ chords: [0, 1, 2], stemUp: false }];
    const result = untangleVoices(chords, beams);
    expect(result.chords.map((c) => c.stemUp)).toEqual([true, true, true, false]);
    expect(result.beams[0].stemUp).toBe(true);
  });

  it('keeps the stems of a melody that dips to its accompaniment, and of groups one after the other', () => {
    const dipping = [chord([4, 6], false, 0), chord([4], true, 0)]; // they share a note
    expect(untangleVoices(dipping, []).chords.map((c) => c.stemUp)).toEqual([false, true]);
    const inTurn = [chord([8], true, 0), chord([2], false, 0.25)]; // one after the other
    expect(untangleVoices(inTurn, []).chords.map((c) => c.stemUp)).toEqual([true, false]);
  });
});

describe('shiftVoicesApart, stems the same way', () => {
  it('moves the voice with the upper note of the second', () => {
    const chord = (steps: number[]) =>
      ({
        staff: 'bass',
        hand: 'left',
        beat: 3,
        beats: 1,
        bar: 0,
        beam: null,
        handMark: false,
        notes: steps.map((step) => ({ step, accidental: null })),
        duration: { value: 'quarter', dots: 0 },
        stemUp: true,
        ledgerSteps: [],
      }) satisfies StaffChord;
    // Si♯3 (step -1) over La3 (step 0), both stems up: Si♯3's voice moves right.
    expect(shiftVoicesApart([chord([0]), chord([-1])]).map((c) => !!c.voiceShift)).toEqual([false, true]);
  });
});
