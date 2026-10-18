// @vitest-environment happy-dom
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { signatureChanges } from '../src/domain/notation/signatures';
import { layout, score } from './showcaseScore';

describe('showcase score: changes along the way', () => {
  it('prints the key and time changes of bars 10 and 13 where they happen', () => {
    const changes = signatureChanges(score).filter((c) => c.key || c.time);
    expect(changes.map((c) => [c.bar, c.key, c.time && `${c.time.numerator}/${c.time.denominator}`])).toEqual([
      [10, { from: 0, to: -3 }, '6/8'],
      [13, { from: -3, to: 2 }, '4/4'],
    ]);
  });

  it('prints the tempo: 90 at the start, a dotted quarter in 6/8, 60 in bar 12, 90 again in bar 13', () => {
    expect(score.notation.tempoMarks.map((m) => [m.beat, `${m.unit.value}${m.unit.dots ? '.' : ''}`, m.perMinute])).toEqual([
      [0, 'quarter', 90],
      [score.notation.bars[10].start, 'quarter.', 60],
      [score.notation.bars[12].start, 'quarter', 60],
      [score.notation.bars[13].start, 'quarter', 90],
    ]);
  });

  it('prints the high notes of bar 13 under 8va and its A0 under 8vb, sounding where they should', () => {
    const start = score.notation.bars[13].start;
    const end = score.notation.bars[14].start;
    expect(score.notation.octaveShifts).toEqual([
      { staff: 1, start, end, octaves: 1 },
      { staff: 2, start: start + 2, end, octaves: -1 },
    ]);
    // Printed an octave nearer…
    const printed = score.notation.notes.filter((n) => n.beat >= start && n.beat < end).map((n) => `${'CDEFGAB'[n.pitch.letter]}${n.pitch.octave}`);
    expect(printed).toEqual(['D5', 'F5', 'A5', 'D2', 'A1']);
    // …but played where written in the file.
    expect(score.notes.some((n) => n.pitch === pitch('La', 6))).toBe(true);
    expect(score.notes.some((n) => n.pitch === pitch('La', 0))).toBe(true);
    expect(layout.octaveShifts.map((s) => [s.staff, s.octaves])).toEqual([
      ['treble', 1],
      ['bass', -1],
    ]);
  });

  it('prints p and f in bars 12 and 13, a crescendo in bar 3 and a diminuendo in bar 5', () => {
    expect(score.notation.dynamics.map((d) => [d.text, d.beat])).toEqual([
      ['p', score.notation.bars[12].start],
      ['f', score.notation.bars[13].start],
    ]);
    expect(score.notation.hairpins.map((h) => [h.type, h.start, h.end])).toEqual([
      ['crescendo', score.notation.bars[3].start, score.notation.bars[4].start],
      ['diminuendo', score.notation.bars[5].start, score.notation.bars[6].start],
    ]);
  });

  it('plays the crescendo of bar 3 louder and louder, and the diminuendo of bar 5 softer', () => {
    const rightHandIn = (bar: number) =>
      score.notes.filter((n) => n.hand === 'right' && n.beat >= score.barBeats[bar] && n.beat < score.barBeats[bar + 1]);
    const cresc = rightHandIn(3).map((n) => n.velocity);
    expect(cresc.at(-1)!).toBeGreaterThan(cresc[0]);
    expect([...cresc].sort((a, b) => a - b)).toEqual(cresc); // never softer along the way
    const dim = rightHandIn(5).map((n) => n.velocity);
    expect(dim.at(-1)!).toBeLessThan(dim[0]);
  });
});
