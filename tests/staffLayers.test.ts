// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { performNotation } from '../src/domain/notation/performance';
import { NOTEHEAD, ACCIDENTAL_GLYPH, FINGERING_GLYPHS } from '../src/infrastructure/render/staff/glyphs';
import { drawStaff, texts } from './drawnStaff';
import { grace, notation, written } from './layerScoreFixtures';

describe('a learned layer on the complete staff', () => {
  it('dims one head, its accidental and its finger within a shared chord without removing notation', () => {
    const score = performNotation(notation([
      written(0, 61, { accidental: 'sharp', fingering: { text: '1', below: false } }),
      written(0, 75, { chord: true, accidental: 'flat', fingering: { text: '5', below: false } }),
    ]));
    const { staff, shown } = drawStaff(score);
    const before = texts(shown).length;
    staff.setActiveNotes([0]);
    const heads = texts(shown).filter((shape) => shape.text === NOTEHEAD.quarter);
    expect(heads).toHaveLength(2);
    // Engraving sorts the upper note first; selected indices still refer to the source order.
    expect(heads[0].opacity).toBeLessThan(1);
    expect(heads[1].opacity ?? 1).toBe(1);
    expect(texts(shown).find((shape) => shape.text === ACCIDENTAL_GLYPH.flat)?.opacity).toBeLessThan(1);
    expect(texts(shown).find((shape) => shape.text === FINGERING_GLYPHS['5'])?.opacity).toBeLessThan(1);
    expect(texts(shown)).toHaveLength(before);
    expect(shown.tape?.chords[0].children.some((shape) => shape.kind === 'line')).toBe(true);
    staff.setActiveNotes(null);
    expect(texts(shown).filter((shape) => shape.text === NOTEHEAD.quarter).every((shape) => (shape.opacity ?? 1) === 1)).toBe(true);
  });
  it('keeps the source index when a hidden chord leader is replaced by a visible note', () => {
    const score = performNotation(notation([written(0, 60, { hidden: true }), written(0, 72, { chord: true })]));
    const { staff, shown } = drawStaff(score);
    staff.setActiveNotes([1]);
    const heads = texts(shown).filter((shape) => shape.text === NOTEHEAD.quarter);
    expect(heads).toHaveLength(1);
    expect(heads[0].opacity ?? 1).toBe(1);
  });
  it('dims only the original grace groups excluded by the selection, even when engraving joins them', () => {
    const score = performNotation(notation([written(0, 72)], { graces: [
      { bar: 0, beat: 0, leadsTo: 0, notes: [grace(67)] },
      { bar: 0, beat: 0, leadsTo: 0, notes: [grace(69)] },
    ] }));
    const { staff, shown } = drawStaff(score);
    staff.setActiveNotes([0], [1]);
    const graceHeads = shown.tape!.graces.flatMap((group) => group.children).filter((shape) => shape.kind === 'text' && shape.text === NOTEHEAD.quarter);
    expect(graceHeads).toHaveLength(2);
    expect(graceHeads[0].kind === 'text' && (graceHeads[0].opacity ?? 1) < 1).toBe(true);
    expect('opacity' in graceHeads[1] ? graceHeads[1].opacity : 1).toBe(1);
  });
});
