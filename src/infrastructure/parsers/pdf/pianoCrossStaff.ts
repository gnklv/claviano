import type { WrittenBar } from '../../../domain/notation/notation';
import type { Clef } from '../../../domain/notation/written';
import type { PdfGeometry, PdfGlyph } from './geometry';
import { isAccidental, isHead, within, type BeamStrip, type Measure } from './pianoGeometry';
import { readEvents, readVoice, validStemGroups, type TimedNote } from './pianoNotes';

/** A beam joining stems from both staves is evidence of one shared voice. */
export function readCrossStaff(geometry: PdfGeometry, measure: Measure, glyphs: PdfGlyph[], middle: number,
  beams: BeamStrip[], bar: WrittenBar, index: number, clefs: readonly Clef[], fifths: number): TimedNote[] | null {
  if (glyphs.some(g => !isHead(g) && !isAccidental(g))) return null;
  const notes: TimedNote[] = [];
  const memberships = new Map<BeamStrip, Set<number>>();
  for (const [i, staff] of measure.staves.entries()) {
    const symbols = glyphs.filter(g => (g.y > middle) === (i === 0));
    const events = readEvents(symbols, staff, geometry.segments, beams, [], true);
    if (!events?.length || !validStemGroups(events, staff.space) || events.some(e => e.headless)) return null;
    const length = events.reduce((sum, event) => sum + event.beats, 0);
    const voice = readVoice(events, symbols, { ...bar, length }, index, staff, i + 1, clefs[i]!, fifths, '1');
    if (!voice || voice.notes.some(n => n.note.chord)) return null;
    notes.push(...voice.notes);
    for (const { stem, beams: marks } of events) {
      if (!stem || !marks.length) continue;
      for (const beam of beams.filter(b => b.left - staff.space * 0.1 <= stem.x && stem.x <= b.right + staff.space * 0.1
        && within(b.yAt(stem.x), stem.far, staff.space * 0.4))) {
        const staves = memberships.get(beam) ?? new Set<number>();
        staves.add(i);
        memberships.set(beam, staves);
      }
    }
  }
  if (![...memberships.values()].some(staves => staves.size === 2)) return null;
  notes.sort((a, b) => a.x - b.x);
  // Simultaneous attacks on different staves cannot be placed one after another in this voice.
  if (notes.some((n, i) => i > 0 && within(n.x, notes[i - 1]!.x, measure.staves[0].space * 0.15))) return null;
  let beat = bar.start;
  const ordered = notes.map(n => {
    const note = { ...n.note, beat };
    beat += note.beats;
    return { ...n, note };
  });
  return within(beat, bar.start + bar.length, 0.001) ? ordered : null;
}
