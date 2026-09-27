// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * End-to-end check on the showcase score (public/demos/showcase.musicxml, built by
 * scripts/showcase.ts): it is parsed and laid out, and every feature it demonstrates shows up.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { barNumber, hasPickup } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { layoutNotation } from '../src/infrastructure/render/notationLayout';

// Tests run from the project root; in happy-dom import.meta.url is not a file path.
const file = readFileSync('public/demos/showcase.musicxml');
const score = new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
const layout = layoutNotation(score);

/** Chords of one bar (by printed number) on one staff, left to right. */
const chordsIn = (number: number, staff: 'treble' | 'bass' = 'treble') =>
  layout.chords.filter((c) => barNumber(score, c.bar) === number && c.staff === staff).sort((a, b) => a.x - b.x);

describe('showcase score', () => {
  it('opens with a pickup and numbers bars 0–14', () => {
    expect(score.title).toBe('Claviano showcase');
    expect(hasPickup(score)).toBe(true);
    expect(barNumber(score, 0)).toBe(0);
    expect(barNumber(score, score.bars.length - 1)).toBe(14);
  });

  it('has every note value, dotted ones and ledger lines', () => {
    const values = new Set(layout.chords.map((c) => c.duration.value));
    expect([...values].sort()).toEqual(['eighth', 'half', 'quarter', 'sixteenth', 'thirtySecond', 'whole']);
    expect(layout.chords.some((c) => c.duration.dots === 1)).toBe(true);
    expect(chordsIn(1)[0].ledgerSteps.length).toBeGreaterThan(0); // Do6 above the staff
    expect(chordsIn(1, 'bass')[0].ledgerSteps.length).toBeGreaterThan(0); // Do2 below the staff
  });

  it('beams as written, up to three levels', () => {
    const thirtySeconds = chordsIn(2).filter((c) => c.duration.value === 'thirtySecond');
    expect(thirtySeconds).toHaveLength(8);
    const beam = thirtySeconds[0].beam;
    expect(beam).not.toBeNull();
    expect(thirtySeconds.every((c) => c.beam === beam)).toBe(true);
  });

  it('prints the accidentals of bar 4 as written', () => {
    expect(chordsIn(4).map((c) => c.notes[0].accidental)).toEqual([
      'sharp',
      null,
      'natural',
      'flat',
      'natural',
      'double-sharp',
      'double-flat',
      'natural',
    ]);
  });

  it('shows the tuplets of bar 5: numbers, a hidden one, a quintuplet and a bracket', () => {
    const inBar5 = layout.tuplets.filter((t) => barNumber(score, layout.chords[t.chords[0]].bar) === 5);
    const summary = inBar5.map((t) => [t.number, t.showNumber, t.bracket]).sort();
    expect(summary).toEqual([
      [3, false, false], // hidden number
      [3, true, false], // beamed triplet
      [3, true, true], // quarter triplet in the bass, with a bracket
      [5, true, false], // quintuplet
    ]);
  });

  it('writes two voices with opposite stems in bar 6, and a whole-bar rest below', () => {
    const [upper] = chordsIn(6).filter((c) => c.notes.length === 3);
    const lower = chordsIn(6).filter((c) => c.notes.length === 1);
    expect(upper.stemUp).toBe(true);
    expect(lower.every((c) => !c.stemUp)).toBe(true);
    const wholeBar = layout.rests.find((r) => r.staff === 'bass' && r.duration.value === 'whole');
    expect(wholeBar).toBeDefined();
  });

  it('has rests of every value', () => {
    const values = new Set(layout.rests.map((r) => r.duration.value));
    expect(values).toEqual(new Set(['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond']));
  });

  it('ties notes across a bar line and in a chord, above and below', () => {
    expect(layout.ties).toHaveLength(4);
    const chordTies = layout.ties.filter((t) => layout.chords[t.from].notes.length === 2);
    expect(chordTies.map((t) => t.above).sort()).toEqual([false, true]);
    // Sounding: the tied Sol4 is one note of 2 + 2 + 1 quarters.
    const sol = score.notes.find((n) => n.pitch === pitch('Sol', 4) && n.beats === 5);
    expect(sol).toBeDefined();
  });

  it('changes key, metre, clef, tempo and loudness along the way', () => {
    expect(score.keySignatures.map((k) => k.fifths)).toEqual([0, -3, 2]);
    expect(score.timeSignatures.map((t) => `${t.numerator}/${t.denominator}`)).toEqual(['4/4', '6/8', '4/4']);
    expect(score.clefs.filter((c) => c.staff === 2).map((c) => c.clef)).toEqual(['bass', 'treble', 'bass']);
    // Bars 10 and 12 are both 6/8, but bar 12 is at 60 instead of 90, so it lasts longer.
    // (With the pickup, a bar's index equals its printed number.)
    const seconds = (bar: number) => score.bars[bar + 1] - score.bars[bar];
    expect(seconds(12)).toBeCloseTo(seconds(10) * 1.5);
    const quiet = score.notes.find((n) => n.pitch === pitch('Sib', 4) && n.beats === 3)!;
    const loud = score.notes.find((n) => n.pitch === pitch('La', 6))!;
    expect(loud.velocity).toBeGreaterThan(quiet.velocity);
  });

  it('spans from La0 to La6, wide enough for the keyboard to scroll on a phone', () => {
    const pitches = score.notes.map((n) => n.pitch);
    expect(Math.min(...pitches)).toBe(pitch('La', 0));
    expect(Math.max(...pitches)).toBe(pitch('La', 6));
  });
});
