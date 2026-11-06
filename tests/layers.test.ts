import { describe, expect, it } from 'vitest';
import { layersOf, type LayerCandidates, type LayerKind } from '../src/domain/practice/layers';
import { createScore, type Score, type ScoreMusic } from '../src/domain/score';
import { spell } from '../src/domain/notation/spelling';
import type { WrittenNote } from '../src/domain/notation/written';

function note(beat: number, sounding: number, options: Partial<WrittenNote> = {}): WrittenNote {
  return {
    bar: Math.floor(beat / 4), staff: 1, voice: '1', hand: 'right', chord: false,
    clef: 'treble', pitch: spell(sounding, 0), sounding, beat, beats: 1,
    duration: { value: 'quarter', dots: 0 }, tuplet: null, tupletStart: null, tupletStop: false,
    accidental: null, stem: null, beams: [], tieStart: false, tieStop: false,
    articulations: [], fermata: null, slurs: [], dynamics: null, ornaments: [],
    trillLine: false, tremolo: null, arpeggio: null, ...options,
  };
}

function score(notes: readonly WrittenNote[], music: ScoreMusic = {}): Score {
  return createScore('layers', [], [], {
    written: notes, writtenBarBeats: [0], writtenEndBeat: 4, ...music,
  });
}

const left = { staff: 2, voice: '1', hand: 'left' } as const;
const indices = (result: LayerCandidates, kind: LayerKind) => result.layers.find((layer) => layer.kind === kind)?.notes;

describe('written practice layers', () => {
  it('adds the complete leading hand and its other voices above the same bass anchors', () => {
    const result = layersOf(score([
      note(0, 72, { beats: 4 }), note(0, 84, { beats: 4, chord: true }),
      note(1, 67, { voice: '2' }), note(0, 48, left), note(0.5, 55, left),
    ]), { from: 0, to: 0 });
    expect(result.layers).toEqual([
      { kind: 'lead', notes: [1] },
      { kind: 'lead-bass', notes: [1, 3] },
      { kind: 'lead-hand-bass', addedHand: 'right', notes: [0, 1, 2, 3] },
      { kind: 'full', notes: [0, 1, 2, 3, 4] },
    ]);
  });

  it('labels an explicitly chosen left-hand expansion by the hand it actually adds', () => {
    const result = layersOf(score([
      note(0, 48, left), note(0, 60, { ...left, chord: true }),
      note(0.5, 55, { ...left, voice: '2' }), note(0, 84, { beats: 4 }),
    ]), { from: 0, to: 0 }, { lead: left });
    expect(result.layers).toContainEqual({ kind: 'lead-hand-bass', addedHand: 'left', notes: [0, 1, 2] });
  });

  it('omits the hand expansion when the selected staff and voice mix hands', () => {
    const result = layersOf(score([
      note(0, 84, { beats: 2 }), note(2, 72, { hand: 'left' }),
      note(0.5, 67, { voice: '2' }), note(0, 48, left), note(0.5, 55, left),
    ]), { from: 0, to: 0 });
    expect(result.layers.some((layer) => layer.kind === 'lead-hand-bass')).toBe(false);
  });

  it('omits a hand expansion whose additional tie chain crosses to the other hand', () => {
    const result = layersOf(score([
      note(0, 84, { beats: 4 }), note(0, 60, { voice: '2', tieStart: true }),
      note(1, 60, { voice: '2', hand: 'left', tieStop: true }),
      note(0, 48, left), note(0.5, 55, left),
    ]), { from: 0, to: 0 });
    expect(result.layers.some((layer) => layer.kind === 'lead-hand-bass')).toBe(false);
  });

  it('keeps staff and voice together when choosing one lead for the whole Part', () => {
    const result = layersOf(score([
      note(0, 72), note(1, 74), note(2, 76), note(3, 77),
      note(0, 48, left), note(1, 50, left), note(2, 52, left), note(3, 53, left),
    ]), { from: 0, to: 0 });
    expect(result.lead).toEqual({ staff: 1, voice: '1' });
    expect(result.voices).toEqual([{ staff: 1, voice: '1' }, { staff: 2, voice: '1' }]);
    expect(result.layers).toEqual([
      { kind: 'lead', notes: [0, 1, 2, 3] },
      { kind: 'full', notes: [0, 1, 2, 3, 4, 5, 6, 7] },
    ]);
  });

  it('prefers sustained coverage over a rare high line, without filling its rests from another voice', () => {
    const result = layersOf(score([
      note(0, 72, { beats: 2 }), note(3, 74),
      note(1, 96, { voice: '2', beats: 0.25 }),
      note(2, 60, { voice: '3' }),
    ]), { from: 0, to: 0 });
    expect(result.lead).toEqual({ staff: 1, voice: '1' });
    expect(indices(result, 'lead')).toEqual([0, 1]);
    expect(result.diagnostics).toContainEqual({ kind: 'multiple-lead-voices', bars: [0] });
  });

  it('counts overlapping chord durations once and uses median pitch to break coverage ties', () => {
    const result = layersOf(score([
      note(0, 48), note(0, 52, { chord: true }), note(0, 55, { chord: true }),
      note(0, 59, { chord: true }), note(0, 60, { chord: true }),
      note(0, 72, { voice: '2', beats: 2 }),
      note(2, 74, { voice: '2', beats: 2 }),
      note(0, 84, { voice: '3', beats: 4 }),
    ]), { from: 0, to: 0 });
    expect(result.lead).toEqual({ staff: 1, voice: '3' });
    expect(indices(result, 'lead')).toEqual([7]);
  });

  it('breaks a remaining tie by staff then voice, independent of source ordering', () => {
    const notes = [note(0, 72, { staff: 2, voice: '2' }), note(0, 72, { voice: '2' }), note(0, 72)];
    expect(layersOf(score(notes), { from: 0, to: 0 }).lead).toEqual({ staff: 1, voice: '1' });
  });

  it('allows an existing voice as the lead override, including the left hand', () => {
    const result = layersOf(score([note(0, 72), note(0, 48, left)]), { from: 0, to: 0 }, { lead: left });
    expect(result.lead).toEqual({ staff: 2, voice: '1' });
    expect(indices(result, 'lead')).toEqual([1]);
    expect(() => layersOf(score([note(0, 72)]), { from: 0, to: 0 }, { lead: { staff: 2, voice: '1' } })).toThrow(RangeError);
  });

  it('takes the highest sounding pitch at each same-moment attack regardless of chord order', () => {
    const result = layersOf(score([
      note(0, 72), note(0, 84, { chord: true }), note(0, 76, { chord: true }),
      note(1 + 1e-8, 79), note(1, 67, { chord: true }),
      note(2, 74),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead')).toEqual([1, 3, 5]);
  });

  it('prefers a right-hand voice even when a left-hand line covers more music', () => {
    const result = layersOf(score([note(0, 48, { ...left, beats: 4 }), note(2, 72)]), { from: 0, to: 0 });
    expect(result.lead).toEqual({ staff: 1, voice: '1' });
  });

  it('falls back to a left-hand voice with an explicit diagnostic', () => {
    const result = layersOf(score([note(0, 48, left), note(0.5, 52, left)]), { from: 0, to: 0 });
    expect(result.lead).toEqual({ staff: 2, voice: '1' });
    expect(result.diagnostics).toContainEqual({ kind: 'left-hand-lead-fallback', bars: [0] });
  });

  it.each([
    [4, 4, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], [1, 3, 5, 7]],
    [6, 8, [0, 0.5, 1, 1.5, 2, 2.5], [1, 4]],
    [2, 2, [0, 1, 2, 3], [1, 3]],
  ])('adds only actual bass attacks on the metrical pulses of %i/%i', (numerator, denominator, beats, bass) => {
    const length = numerator * 4 / denominator;
    const result = layersOf(score([
      note(0, 84, { beats: length }),
      ...beats.map((beat) => note(beat, 48, { ...left, beats: 0.25 })),
    ], { writtenEndBeat: length, timeSignatures: [{ beat: 0, numerator, denominator }] }), { from: 0, to: 0 });
    expect(indices(result, 'lead-bass')).toEqual([0, ...bass]);
  });

  it('does not mistake upper accompaniment attacks for bass while a lower note is held', () => {
    const result = layersOf(score([
      note(0, 84, { beats: 4 }), note(0, 37, { ...left, beats: 4 }),
      note(1, 56, { ...left, voice: '2' }), note(2, 56, { ...left, voice: '2' }), note(3, 56, { ...left, voice: '2' }),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead-bass')).toEqual([0, 1]);
  });

  it('allows a new bass when the lower note ends, and a fresh attack at the same pitch', () => {
    const result = layersOf(score([
      note(0, 84, { beats: 4 }), note(0, 37, { ...left, beats: 1 }),
      note(1, 48, { ...left, beats: 2 }), note(2, 48, left), note(3.5, 60, left),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead-bass')).toEqual([0, 1, 2, 3]);
  });

  it('respects a lower incoming tied bass and an off-pulse held note across fragment boundaries', () => {
    const source = score([
      note(3, 37, { ...left, tieStart: true }), note(4, 37, { ...left, bar: 1, tieStop: true, beats: 2 }),
      note(4, 84, { bar: 1, beats: 4 }), note(4, 56, { ...left, bar: 1, voice: '2' }),
      note(6, 48, { ...left, bar: 1 }), note(6.5, 36, { ...left, bar: 1, beats: 1.5 }),
      note(7, 56, { ...left, bar: 1, voice: '2' }),
    ], { writtenBarBeats: [0, 4], writtenEndBeat: 8 });
    expect(indices(layersOf(source, { from: 1, to: 1 }), 'lead-bass')).toEqual([2, 4]);
  });

  it('aligns a partial compound pickup with the end of the metre', () => {
    const result = layersOf(score([
      note(0, 84), note(0, 48, left), note(0.5, 43, left),
      note(1, 86, { bar: 1 }), note(1.5, 48, { ...left, bar: 1 }),
    ], { writtenBarBeats: [0, 1], writtenEndBeat: 4, timeSignatures: [{ beat: 0, numerator: 6, denominator: 8 }] }), { from: 0, to: 0 });
    expect(result.layers).toEqual([
      { kind: 'lead', notes: [0] },
      { kind: 'full', notes: [0, 1, 2] },
    ]);
    expect(result.diagnostics).toContainEqual({ kind: 'no-bass-pulses', bars: [0] });
  });

  it('keeps syncopated bass where written and chooses the lowest fresh attack at a pulse', () => {
    const result = layersOf(score([
      note(0, 84, { beats: 4 }), note(0, 48, left), note(0, 36, { ...left, voice: '2' }),
      note(0.5, 40, left), note(1, 36, { ...left, voice: '2', tieStop: true }),
      note(1, 50, left), note(2.5, 43, left),
    ]), { from: 0, to: 0 });
    // The lower off-pulse bass is still held at beat 1: the higher attack is accompaniment.
    expect(indices(result, 'lead-bass')).toEqual([0, 2]);
  });

  it('closes selected ties in both directions without replacing them with higher reattacks', () => {
    const result = layersOf(score([
      note(0, 72, { tieStart: true }), note(1, 72, { tieStart: true, tieStop: true }),
      note(1, 84, { chord: true }), note(2, 72, { tieStop: true }), note(2, 86, { chord: true }),
      note(3, 67), note(3, 79, { tieStop: true, chord: true }),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead')).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('does not connect a tie across a gap or across staff and voice', () => {
    const result = layersOf(score([
      note(0, 72, { tieStart: true }),
      note(1, 72, { voice: '2', tieStop: true }),
      note(2, 72, { tieStop: true }), note(2, 84, { chord: true }),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead')).toEqual([0, 3]);
  });

  it('reports ties through a Part boundary without including notes from neighbouring bars', () => {
    const result = layersOf(score([
      note(3, 72, { tieStart: true }), note(4, 72, { bar: 1, tieStop: true, tieStart: true, beats: 4 }),
      note(8, 72, { bar: 2, tieStop: true }),
    ], { writtenBarBeats: [0, 4, 8], writtenEndBeat: 12 }), { from: 1, to: 1 });
    expect(result.layers).toEqual([{ kind: 'full', notes: [1] }]);
    expect(result.diagnostics).toContainEqual({ kind: 'tie-across-boundary', bars: [1] });
  });

  it('keeps an incoming tied lead above fresh bass attacks at the beginning of a Part', () => {
    const result = layersOf(score([
      note(3, 72, { tieStart: true }), note(4, 72, { bar: 1, tieStop: true, beats: 4 }),
      note(4, 48, { ...left, bar: 1 }), note(4.5, 55, { ...left, bar: 1 }),
    ], { writtenBarBeats: [0, 4], writtenEndBeat: 8 }), { from: 1, to: 1 });
    expect(result.layers).toEqual([
      { kind: 'lead', notes: [1] },
      { kind: 'lead-bass', notes: [1, 2] },
      { kind: 'full', notes: [1, 2, 3] },
    ]);
    expect(result.diagnostics).toContainEqual({ kind: 'tie-across-boundary', bars: [1] });
  });

  it('keeps the entering lead chain alongside later lead attacks while bass continuations remain unselected', () => {
    const result = layersOf(score([
      note(3, 72, { tieStart: true }), note(3, 36, { ...left, tieStart: true }),
      note(4, 72, { bar: 1, tieStop: true, tieStart: true }),
      note(5, 72, { bar: 1, tieStop: true, beats: 2 }), note(7, 74, { bar: 1 }),
      note(4, 36, { ...left, bar: 1, tieStop: true }), note(4, 48, { ...left, bar: 1 }),
      note(4.5, 43, { ...left, bar: 1 }), note(6, 50, { ...left, bar: 1 }),
    ], { writtenBarBeats: [0, 4], writtenEndBeat: 8 }), { from: 1, to: 1 });
    expect(indices(result, 'lead')).toEqual([2, 3, 4]);
    // The entering low bass also keeps the higher simultaneous attack out of the bass layer.
    expect(indices(result, 'lead-bass')).toEqual([2, 3, 4, 8]);
  });

  it('keeps all source notes in full, including hidden and headless notes', () => {
    const result = layersOf(score([
      note(0, 72), note(0, 96, { hidden: true }), note(1, 84, { headless: true }),
    ]), { from: 0, to: 0 });
    expect(indices(result, 'lead')).toEqual([0]);
    expect(indices(result, 'full')).toEqual([0, 1, 2]);
  });

  it('omits empty and duplicate layers, with full winning over reduced labels', () => {
    expect(layersOf(score([note(0, 72)]), { from: 0, to: 0 }).layers).toEqual([{ kind: 'full', notes: [0] }]);
    const empty = layersOf(score([]), { from: 0, to: 0 });
    expect(empty).toMatchObject({ lead: null, voices: [], layers: [] });
  });

  it('uses only the Part and leaves the score and caller-owned choices unchanged', () => {
    const source = score([note(0, 72), note(4, 74, { bar: 1 })], { writtenBarBeats: [0, 4], writtenEndBeat: 8 });
    const before = JSON.stringify(source);
    const part = Object.freeze({ from: 1, to: 1 });
    const lead = Object.freeze({ staff: 1, voice: '1' });
    expect(layersOf(source, part, { lead }).layers).toEqual([{ kind: 'full', notes: [1] }]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects reversed, fractional, and out-of-bounds written bar ranges', () => {
    const source = score([]);
    for (const part of [{ from: 1, to: 0 }, { from: -1, to: 0 }, { from: 0, to: 1 }, { from: 0.5, to: 0.5 }]) {
      expect(() => layersOf(source, part)).toThrow(RangeError);
    }
    expect(() => layersOf({ ...source, notation: { ...source.notation, bars: [] } }, { from: 0, to: -1 })).toThrow(RangeError);
  });

  it('reports written decorations and graces separately with unique written bar indices', () => {
    const source = score([
      note(0, 72, { ornaments: [{ kind: 'trill', accidentalAbove: null, accidentalBelow: null, below: false }], tremolo: { type: 'single', strokes: 1 } }),
      note(1, 74, { trillLine: true, arpeggio: 'up' }),
      note(4, 76, { bar: 1, arpeggio: 'down' }),
    ], { writtenBarBeats: [0, 4], writtenEndBeat: 8, graces: [{ bar: 0, beat: 0, leadsTo: 0, notes: [] }, { bar: 1, beat: 4, leadsTo: 2, notes: [] }] });
    const result = layersOf(source, { from: 0, to: 0 });
    for (const kind of ['ornaments-present', 'graces-present', 'tremolo-present', 'arpeggio-present']) {
      expect(result.diagnostics).toContainEqual({ kind, bars: [0] });
    }
  });
});
