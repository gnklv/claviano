import { readStemTremolos } from './pianoTremolos';
import { BEATS } from '../../../domain/notation/noteValue';
import type { WrittenBar } from '../../../domain/notation/notation';
import { keyAlteration, midiOf, type Alteration } from '../../../domain/notation/spelling';
import type { BeamMark, Clef, WrittenNote, WrittenRest } from '../../../domain/notation/written';
import type { PdfGlyph, PdfPoint, PdfSegment } from './geometry';
import {
  WHOLE, HALF, BLACK, DOT, FLAT, codePoint, within, isHead, isAccidental, pitchAt, beamMarks,
  BEAM_VALUES, ACCIDENTALS, type Staff, type Stem, type BeamStrip,
} from './pianoGeometry';

interface AttachedStem extends Stem {
  readonly near: number;
}

interface HeadAttachment {
  readonly head: PdfGlyph;
  readonly whole: boolean;
  readonly up: AttachedStem | undefined;
  readonly down: AttachedStem | undefined;
  readonly columnX?: number;
}

export interface Event {
  readonly head: PdfGlyph;
  readonly stem: AttachedStem | undefined;
  readonly duration: WrittenNote['duration'];
  readonly beams: BeamMark[];
  readonly beats: number;
  readonly headless: boolean;
  readonly showAccidental: boolean;
  readonly columnX?: number;
  readonly tremolo?: WrittenNote['tremolo'];
  readonly tuplet?: WrittenNote['tuplet'];
  readonly tupletStart?: WrittenNote['tupletStart'];
  readonly tupletStop?: WrittenNote['tupletStop'];
}

// Covers binary durations through thirty-seconds with dots, triplets and quintuplets.
const TICKS_PER_BEAT = 960;

export interface TimedNote extends PdfPoint {
  /** Shared time column when the engraving offsets this head to avoid a collision. */
  readonly columnX?: number;
  readonly note: WrittenNote;
}

function stemAt(head: PdfGlyph, up: boolean, segments: readonly PdfSegment[], space: number, chordMember: boolean, chordSpan = 0): AttachedStem | undefined {
  const nominalX = head.x + space * (up ? 1.25 : 0.055);
  const candidates = segments.flatMap((line) => {
    if (!within(line.x1, line.x2, space * 0.025) || !within(line.x1, nominalX, space * 0.15)) return [];
    const low = Math.min(line.y1, line.y2);
    const high = Math.max(line.y1, line.y2);
    const near = up ? low : high;
    const far = up ? high : low;
    const atHead = chordMember
      ? head.y >= low - space * 0.25 && head.y <= high + space * 0.25
      : within(near, head.y, space * 1.45);
    if (!atHead || high - low < space * 1.8 || high - low > space * 6 + chordSpan
      || (up ? far - head.y : head.y - far) < space * (chordMember ? 0 : 1.8)) return [];
    return [{ x: line.x1, near, far, up }];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

// Bravura offsets heads in a second by one head width, measured in staff spaces.
const HEAD_OFFSET = 1.078;

export function dotAtHead(dot: PdfPoint, head: PdfPoint, space: number): boolean {
  return dot.x > head.x + space * 1.35 && dot.x < head.x + space * 2.25 && within(dot.y, head.y, space * 0.55);
}

export function durationDotCandidates(dot: PdfPoint, heads: readonly PdfGlyph[], space: number): PdfGlyph[] {
  return heads.filter(head => dotAtHead(dot, head, space)
    || isHead(head) && dotAtHead(dot, { ...head, x: head.x + space * HEAD_OFFSET }, space)
      && heads.some(right => isHead(right) && within(right.x - head.x, space * HEAD_OFFSET, space * 0.15)
        && within(right.y, head.y, space * 4.5)));
}

function attachDisplacedHeads(attachments: HeadAttachment[], segments: readonly PdfSegment[], space: number): HeadAttachment[] | null {
  const output: HeadAttachment[] = [];
  for (const entry of attachments) {
    const { head, whole } = entry;
    const candidates = whole ? [] : [true, false].flatMap(up => {
      if (up ? entry.up : entry.down) return [];
      const stem = stemAt({ ...head, x: head.x + space * (up ? -HEAD_OFFSET : HEAD_OFFSET) }, up, segments, space, true);
      if (!stem) return [];
      // The displaced head's usual attachment edge can appear to meet the same stem,
      // reversed, near its base. Preserve attachments to any genuine second stem.
      const opposite = up ? entry.down : entry.up;
      if (opposite && (opposite.x !== stem.x || opposite.far !== stem.near || Math.abs(opposite.far - head.y) >= space * 1.8)) return [];
      const adjacent = attachments.find(other => sameStem(up ? other.up : other.down, stem)
        && within(Math.abs(other.head.y - head.y), space / 2, space * 0.12));
      return adjacent ? [{ ...entry, up: up ? stem : undefined, down: up ? undefined : stem, columnX: adjacent.head.x }] : [];
    });
    if (candidates.length > 1) return null;
    output.push(candidates[0] ?? entry);
  }
  return output;
}

function matchDurationDots(attachments: HeadAttachment[], dots: readonly PdfPoint[], space: number,
  stemmedChords: boolean): Set<PdfGlyph> | null {
  const dottedHeads = new Set<PdfGlyph>();
  const assignedDots = new Set<PdfPoint>();
  for (const { head, up, down } of attachments) {
    const stem = up ?? down;
    const group = stem ? attachments.filter(a => sameStem(a.up ?? a.down, stem)) : [];
    const chord = group.some(a => a.columnX !== undefined);
    if (chord && group[0]?.head !== head) continue;
    const heads = chord ? group.map(a => a.head).sort((a, b) => a.y - b.y) : [head];
    // The dots share a column to the right of all heads, including displaced ones.
    const right = Math.max(...heads.map(a => a.x));
    const matches = dots.filter(dot => heads.some(member => dotAtHead(dot, { ...member, x: right }, space)))
      .sort((a, b) => a.y - b.y);
    if (!matches.length) continue;
    if (matches.length !== heads.length || matches.some((dot, i) => assignedDots.has(dot)
      || !within(dot.x, matches[0]!.x, space * 0.15)
      || !dotAtHead(dot, { ...heads[i]!, x: right }, space))) return null;
    for (const dot of matches) assignedDots.add(dot);
    for (const member of heads) dottedHeads.add(member);
  }
  return stemmedChords && assignedDots.size !== dots.length ? null : dottedHeads;
}

export function readEvents(glyphs: readonly PdfGlyph[], staff: Staff, segments: readonly PdfSegment[], beams: readonly BeamStrip[], drawnDots: readonly PdfPoint[] = [], stemmedChords = false): Event[] | null {
  const output: Event[] = [];
  const space = staff.space;
  const heads = glyphs.filter(isHead);
  const standard: HeadAttachment[] = heads.map(head => {
    const column = stemmedChords ? heads.filter(other => within(other.x, head.x, space * 0.15)) : [head];
    const heights = column.map(other => other.y);
    const chordSpan = Math.max(...heights) - Math.min(...heights);
    const whole = codePoint(head) === WHOLE;
    const up = whole ? undefined : stemAt(head, true, segments, space, stemmedChords, chordSpan);
    const sharedDown = up && codePoint(head) === HALF && stemmedChords
      ? stemAt({ ...head, x: head.x - space * 0.30 }, false, segments, space, false) : undefined;
    return { head, whole, up,
      down: whole ? undefined : stemAt(head, false, segments, space, stemmedChords, chordSpan) ?? sharedDown };
  });
  const attachments = stemmedChords ? attachDisplacedHeads(standard, segments, space) : standard;
  if (!attachments) return null;
  const dots = [...drawnDots, ...glyphs.filter(glyph => codePoint(glyph) === DOT)];
  const dottedHeads = matchDurationDots(attachments, dots, space, stemmedChords);
  if (!dottedHeads) return null;
  const staffStems = attachments.flatMap(({ up, down }) => [up, down].filter(stem => stem !== undefined));
  for (const { head, whole, up, down, columnX } of attachments) {
    if (!whole && !up && !down) return null;
    const stems = whole ? [undefined] : [down, up].filter((stem) => stem !== undefined);
    const dotted = dottedHeads.has(head);
    for (const stem of stems) {
      const marks = stem ? beamMarks(stem, beams, staff.space, staffStems) : [];
      const flag = stem && glyphs.find((glyph) => codePoint(glyph) >= 0xe240 && codePoint(glyph) <= 0xe245
        && within(glyph.x, stem.x, staff.space * 0.18) && within(glyph.y, stem.far, staff.space * 0.4));
      if (flag && marks.length) return null;
      const flags = flag ? 1 + Math.floor((codePoint(flag) - 0xe240) / 2) : marks.length;
      const sharedHalf = !!(up && down && codePoint(head) === HALF);
      const value = whole ? 'whole' : codePoint(head) === HALF && !(sharedHalf && !stem?.up) ? 'half' : BEAM_VALUES[flags];
      if (!value || flags && codePoint(head) !== BLACK && !sharedHalf) return null;
      // A dotted upper voice and a beamed lower voice can share the same printed head.
      const sharedHead = !!(up && down);
      if (sharedHead && ((!sharedHalf && (codePoint(head) !== BLACK || !dotted)) || (stem?.up ? flags !== 0 : marks.length === 0))) return null;
      const headless = sharedHead && !stem?.up;
      const dots = dotted && !headless ? 1 : 0;
      output.push({ head, stem, ...(columnX === undefined ? {} : { columnX }),
        duration: { value, dots }, beams: marks, beats: BEATS[value] * (dots ? 1.5 : 1),
        headless, showAccidental: !sharedHead || headless });
    }
  }
  return readStemTremolos(output, glyphs, beams, space);
}

export interface RestEvent {
  readonly rest: PdfGlyph;
  readonly duration: WrittenRest['duration'];
  readonly beats: number;
}

export function sameStem(first: Stem | undefined, second: Stem | undefined): boolean {
  return !!first && !!second && first.x === second.x && first.up === second.up && first.far === second.far;
}

export function validStemGroups(events: readonly Event[], space: number): boolean {
  return events.every(event => {
    const stem = event.stem;
    if (!stem) return true;
    const group = events.filter(member => sameStem(member.stem, stem));
    return group.filter(member => member.columnX === undefined && within(member.head.y, stem.near, space * 0.35)).length === 1
      && group.every(member => within(member.columnX ?? member.head.x, event.columnX ?? event.head.x, space * 0.15));
  });
}

function attachAccidentals(glyphs: readonly PdfGlyph[], events: readonly (Event | RestEvent)[], space: number): Map<PdfGlyph, PdfGlyph> | null {
  const heads = glyphs.filter(isHead);
  const attacks = events.filter((e): e is Event => 'head' in e);
  const marks = new Map<PdfGlyph, PdfGlyph>();
  for (const glyph of glyphs.filter(isAccidental)) {
    // Double flats extend farther to the left than the other glyphs.
    const targets = heads.filter(head => {
      const event = attacks.find(e => e.head === head);
      const group = event?.stem ? attacks.filter(e => sameStem(e.stem, event.stem)) : [];
      const left = Math.min(head.x, ...group.map(e => e.head.x));
      return glyph.x < head.x && left - glyph.x < space * 2
        && within(glyph.y, head.y, space * 0.15);
    });
    const head = targets[0];
    if (targets.length !== 1 || !head || marks.has(head)) return null;
    marks.set(head, glyph);
  }
  return marks;
}

export function readVoice(
  events: readonly (Event | RestEvent)[], glyphs: readonly PdfGlyph[], bar: WrittenBar, barIndex: number, staff: Staff,
  number: number, clef: Clef, fifths: number, voice: string,
): { notes: TimedNote[]; rests: { x: number; rest: WrittenRest }[] } | null {
  const notes: TimedNote[] = [];
  const rests: { x: number; rest: WrittenRest }[] = [];
  const printedMarks = attachAccidentals(glyphs, events, staff.space);
  if (!printedMarks) return null;
  const accidentals = new Map<number, Alteration>();
  let offsetTicks = 0;
  let anchor: Event | undefined;
  const occupiedDegrees = new Set<number>();
  const xOf = (event: Event | RestEvent) => 'rest' in event ? event.rest.x : event.columnX ?? event.head.x;
  const timeline = events.some(e => 'head' in e && e.columnX !== undefined) ? [...events].sort((a, b) =>
    xOf(a) - xOf(b) || ('head' in a && 'head' in b ? a.head.y - b.head.y : 0)) : events;
  for (const event of timeline) {
    const ticks = Math.round(event.beats * TICKS_PER_BEAT);
    if (!within(ticks, event.beats * TICKS_PER_BEAT, 0.001)) return null;
    const beat = bar.start + offsetTicks / TICKS_PER_BEAT;
    if ('rest' in event) {
      rests.push({ x: event.rest.x, rest: { staff: number, voice, beat, duration: event.duration,
        clef, measure: false, displayPitch: null } });
      offsetTicks += ticks;
      anchor = undefined;
      continue;
    }
    const { head, stem, duration, beams, beats, headless, columnX } = event;
    const sameColumn = !!anchor && within(xOf(anchor), xOf(event), staff.space * 0.15);
    const chord = !!anchor && sameColumn && (sameStem(anchor.stem, stem)
      || (anchor.duration.value === 'whole' && duration.value === 'whole'));
    if (sameColumn && (!chord || anchor?.duration.value !== duration.value || anchor.beats !== beats)) return null;
    if (!chord) {
      anchor = event;
      occupiedDegrees.clear();
    }
    const onset = bar.start + (offsetTicks - (chord ? ticks : 0)) / TICKS_PER_BEAT;
    const position = pitchAt(head.y, staff, clef);
    if (!position || onset >= bar.start + bar.length) return null;
    const degree = position.octave * 7 + position.letter;
    if (occupiedDegrees.has(degree)) return null;
    occupiedDegrees.add(degree);
    const printed = printedMarks.get(head);
    const accidental = printed && ACCIDENTALS[codePoint(printed) - FLAT];
    if (accidental) accidentals.set(degree, accidental[1]);
    const pitch = { ...position, alteration: accidentals.get(degree) ?? keyAlteration(position.letter, fifths) };
    notes.push({ x: head.x, y: head.y, ...(columnX === undefined ? {} : { columnX }), note: {
      bar: barIndex, staff: number, voice, hand: number === 1 ? 'right' : 'left', chord,
      clef, pitch, sounding: midiOf(pitch), beat: onset, beats: ticks / TICKS_PER_BEAT, duration,
      tuplet: event.tuplet ?? null, tupletStart: event.tupletStart ?? null, tupletStop: event.tupletStop ?? false,
      accidental: event.showAccidental ? accidental?.[0] ?? null : null, stem: stem ? stem.up ? 'up' : 'down' : null,
      beams, tieStart: false, tieStop: false, articulations: [], fermata: null, slurs: [],
      dynamics: null, ornaments: [], trillLine: false, tremolo: event.tremolo ?? null, arpeggio: null, headless,
    } });
    if (!chord) offsetTicks += ticks;
  }
  return within(offsetTicks / TICKS_PER_BEAT, bar.length, 0.001) ? { notes, rests } : null;
}
