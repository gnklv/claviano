import type { WrittenBar } from '../../../domain/notation/notation';
import type { Clef } from '../../../domain/notation/written';
import type { PdfGlyph, PdfPoint, PdfSegment } from './geometry';
import { BLACK, HALF, center, codePoint, isAccidental, isHead, within, type BeamStrip, type Staff } from './pianoGeometry';
import { readEvents, readVoice, validStemGroups, type TimedNote, type RestEvent } from './pianoNotes';

const QUARTER_REST = 0xe4e5;

/** Read two complete voices distinguished by opposite stems. Half-note chords
 * share a stem, and a rest on the outside of the staff belongs to that voice. */
export function readPolyphonicStaff(
  glyphs: readonly PdfGlyph[], staff: Staff, segments: readonly PdfSegment[], beams: readonly BeamStrip[],
  dots: readonly PdfPoint[], bar: WrittenBar, barIndex: number, number: number, clef: Clef, fifths: number,
): ReturnType<typeof readVoice> {
  const space = staff.space;
  const reduced = glyphs.filter(g => within(g.size, space * 3, space * 0.12));
  if (reduced.length) {
    const full = glyphs.filter(g => !reduced.includes(g));
    if (!full.every(isHead) || reduced.some(g => !isHead(g) && !isAccidental(g) && codePoint(g) !== 0xe241)) return null;
    const smallSpace = space * 0.75;
    const cueDots = dots.map(dot => {
      const targets = reduced.filter(g => isHead(g) && dot.x - g.x > space && dot.x - g.x < space * 1.7
        && within(dot.y, g.y, space * 0.55));
      return targets.length === 1 ? { ...dot, y: targets[0]!.y } : null;
    });
    if (cueDots.some(dot => !dot)) return null;
    const upper = readEvents(full, staff, segments, beams, [], true);
    const lower = readEvents(reduced, { ...staff, space: smallSpace }, segments, beams, cueDots.filter(dot => dot !== null), true);
    if (!upper || !lower || upper.some(e => !e.stem?.up) || lower.some(e => !e.stem || e.stem.up)
      || !validStemGroups(upper, space) || !validStemGroups(lower, smallSpace)) return null;
    for (const flag of reduced.filter(g => codePoint(g) === 0xe241)) {
      const targets = lower.filter(e => e.stem && within(flag.x, e.stem.x, smallSpace * 0.18)
        && within(flag.y, e.stem.far, smallSpace * 0.4));
      if (targets.length !== 1 || targets[0]!.duration.value !== 'eighth') return null;
    }
    const main = readVoice(upper, full, bar, barIndex, staff, number, clef, fifths, String(1 + (number - 1) * 4));
    const cue = readVoice(lower.sort((a, b) => a.head.x - b.head.x || a.head.y - b.head.y), reduced, bar, barIndex,
      staff, number, clef, fifths, String(2 + (number - 1) * 4));
    if (!main || !cue) return null;
    // A printed accidental in one voice can change an ensuing pitch in the other.
    // Defer such bars until both voices share an accidental timeline.
    if (cue.notes.some(({ note }) => note.accidental && main.notes.some(({ note: other }) =>
      other.beat >= note.beat && other.pitch.letter === note.pitch.letter && other.pitch.octave === note.pitch.octave))) return null;
    return { notes: [...main.notes, ...cue.notes.map(entry => ({ ...entry, note: { ...entry.note, small: true } }))], rests: [] };
  }
  // Accidentals require a common staff timeline, including carry across voices.
  if (glyphs.some(g => ![BLACK, HALF, QUARTER_REST].includes(codePoint(g)))) return null;
  const events = readEvents(glyphs, staff, segments, beams, dots, true);
  if (!events || events.some(e => !e.stem || e.duration.dots)) return null;
  if (!events.some(e => e.headless) && events.some(e => e.beams.length)) return null;
  if (!validStemGroups(events, space)) return null;
  const pauses = glyphs.filter(g => codePoint(g) === QUARTER_REST);
  const middle = center(staff);
  if (pauses.some(g => !within(Math.abs(g.y - middle), space * 2, space * 0.15))) return null;
  const voice = (up: boolean, id: number) => {
    const voiceEvents = events.filter(e => e.stem?.up === up);
    if (!voiceEvents.length) return null;
    const rests = pauses.filter(rest => (rest.y > middle) === up).map((rest): RestEvent =>
      ({ rest, duration: { value: 'quarter', dots: 0 }, beats: 1 }));
    const timeline = [...voiceEvents, ...rests].sort((a, b) => {
      const first = 'rest' in a ? a.rest : a.head;
      const second = 'rest' in b ? b.rest : b.head;
      return first.x - second.x || first.y - second.y;
    });
    return readVoice(timeline, glyphs, bar, barIndex, staff, number, clef, fifths, String(id));
  };
  const upper = voice(true, 1 + (number - 1) * 4);
  const lower = voice(false, 2 + (number - 1) * 4);
  if (!upper || !lower) return null;
  // With adjacent pitches in opposite voices, the lower voice can move right
  // by a head width. Its temporal column remains shared with the upper chord.
  const lowerNotes = lower.notes.map(entry => {
    const { note, x } = entry;
    const upperColumn = upper.notes.filter(e => e.note.beat === note.beat);
    const oppositeSecond = upperColumn.find(e => {
      const degree = (pitch: typeof note.pitch) => pitch.octave * 7 + pitch.letter;
      return degree(e.note.pitch) - degree(note.pitch) === 1;
    });
    if (oppositeSecond && note.duration.value === 'half' && oppositeSecond.note.duration.value === 'half'
      && within(x - oppositeSecond.x, space * 1.18, space * 0.15)) return { ...entry, columnX: oppositeSecond.x };
    return entry;
  });
  return { notes: [...upper.notes, ...lowerNotes], rests: [...upper.rests, ...lower.rests] };
}

/** A lone printed note following silence can be placed by a simultaneous attack on the other staff. */
export function readTrailingVoice(glyphs: PdfGlyph[], staff: Staff, segments: readonly PdfSegment[], beams: BeamStrip[],
  bar: WrittenBar, index: number, number: number, clef: Clef, fifths: number, columns: readonly TimedNote[]) {
  if (glyphs.length !== 1 || !isHead(glyphs[0]!)) return null;
  const events = readEvents(glyphs, staff, segments, beams, [], true);
  if (events?.length !== 1 || !validStemGroups(events, staff.space)) return null;
  const event = events[0]!;
  const start = bar.start + bar.length - event.beats;
  const firstX = Math.min(...columns.map(n => n.columnX ?? n.x));
  const orphanStem = segments.some(line => within(line.x1, line.x2, staff.space * 0.025)
    && line.x1 >= firstX - staff.space * 0.15 && line.x1 < event.head.x - staff.space * 0.3
    && Math.abs(line.y1 - line.y2) >= staff.space * 1.8
    && within((line.y1 + line.y2) / 2, center(staff), staff.space * 4));
  if (orphanStem) return null;
  const matches = columns.filter(n => within(n.columnX ?? n.x, event.head.x, staff.space * 0.15));
  if (start <= bar.start || !matches.length || matches.some(n => n.note.beat !== start)) return null;
  return readVoice(events, glyphs, { ...bar, start, length: event.beats }, index, staff, number, clef, fifths,
    String(1 + (number - 1) * 4));
}
