import { barAtBeat, type KeySignature, type Score, type TimeSignature } from '../../../domain/score';
import { lastAtOrBefore } from '../../../domain/search';
import { cancelledSteps, signatureChanges, type SignatureChange } from '../../../domain/notation/signatures';
import { beatAtPosition, beatPosition, tapeBars, type Clef } from '../staffLayout';

/*
 * All sizes are in staff spaces (the distance between two staff lines),
 * so the whole staff scales with the height of the view.
 */
export const LINES_PER_STAFF = 5;
/** Between the bottom line of the treble staff and the top line of the bass staff. */
const STAFF_GAP = 6;
/** Height the staff needs, including room for ledger lines and bar numbers. */
const CONTENT_HEIGHT = 24;
const MIN_SPACE_PX = 6;
const MAX_SPACE_PX = 14;
/** About this many bars fit on the tape, within the bar width limits below. */
const BARS_VISIBLE = 2.2;
/** Narrower bars would not leave room for notes; wider ones waste a wide screen. */
const MIN_BAR_WIDTH = 16;
const MAX_BAR_WIDTH = 40;
/*
 * The left column does not scroll: clefs, then the key signature, then the time signature.
 * Its width fits the widest signatures of the piece, so a key change doesn't shift the tape.
 */
export const CLEF_AREA = 4.2;
export const SHARP_ADVANCE = 1.1;
export const FLAT_ADVANCE = 1.0;
const TIME_DIGIT_WIDTH = 1.8;
export const SIGNATURE_GAP = 0.6;
const GUTTER_END_GAP = 1.2;
/*
 * Notes sit on the tape exactly where their beat is, so the cursor crosses a notehead when it
 * sounds. Bar lines are drawn a little before the bar's first beat to leave room for its note.
 */
export const BAR_LINE_GAP = 1.4;
/** The cursor stands at this share of the tape's width, leaving room to read ahead. */
const CURSOR_AT = 0.3;

/**
 * Room for repeat signs, in staff spaces: the ‖: and :‖ glyphs are REPEAT_GLYPH_WIDTH wide and
 * stand on the bar line, so a ‖: gets room before the bar's first note, a :‖ after its last note.
 */
export const REPEAT_GLYPH_WIDTH = 1.5;
const REPEAT_LEAD = 1.6;
const REPEAT_TAIL = 2.2;

/*
 * A key or time change inside the music gets room before the bar's first note: a gap after the bar
 * line, the cancelling naturals, the new key, the new time signature, and a gap before the note.
 */
export const CHANGE_GAP_BEFORE = 0.8;
const CHANGE_GAP_AFTER = 0.4;
export const NATURAL_ADVANCE = 1.0;

/** A bar's first note already stands BAR_LINE_GAP after its line: this much of it is free for grace notes. */
const GRACE_ROOM_AT_BAR_LINE = 0.5;
const NO_GRACES = { lead: new Map<number, number>(), tail: new Map<number, number>() };

/**
 * Where things go on the staff, in pixels: the staff lines, the bars along the tape (with room at
 * bar lines for repeat signs and key or time changes) and the left column.
 */
export class StaffGeometry {
  /** One staff space in pixels. */
  space = 10;
  width = 0;
  height = 0;
  /** Width of the left column in staff spaces, fitted to the piece's signatures. */
  gutterSpaces = CLEF_AREA + GUTTER_END_GAP;
  /** Key and time changes along the page. */
  changes: SignatureChange[] = [];
  /**
   * Room on the tape, in staff spaces, for what is printed at bar lines: `lead[i]` between bar i's
   * line and its first note (a ‖:, a key or time change), `tail[i]` between its last note and the
   * next line (a :‖). `roomBefore[i]` adds up all the room before bar i's line.
   */
  lead: number[] = [];
  tail: number[] = [];
  private roomBefore: number[] = [0];
  private score: Score | null = null;
  private barIndices: number[] = [];

  /** `graceRoom`: what the grace notes at the start and at the end of each printed bar need (see setScore's callers). */
  setScore(score: Score | null, graceRoom: { lead: ReadonlyMap<number, number>; tail: ReadonlyMap<number, number> } = NO_GRACES): void {
    this.score = score;
    this.changes = score ? signatureChanges(score) : [];
    const bars = score?.notation.bars ?? [];
    this.lead = bars.map((bar) => (bar.navigation.repeatStart ? REPEAT_LEAD : 0));
    this.tail = bars.map((bar) => (bar.navigation.repeatEnd ? REPEAT_TAIL : 0));
    // (A bar the page does not have gets no room.)
    const widen = (rooms: number[], bar: number, by: number) => {
      if (rooms[bar] !== undefined) rooms[bar] += by;
    };
    for (const change of this.changes) widen(this.lead, change.bar, signatureChangeWidth(change));
    // Grace notes before a bar's first note stand between the bar line and it; those after its last note, before the next line.
    for (const [bar, room] of graceRoom.lead) widen(this.lead, bar, Math.max(0, room - GRACE_ROOM_AT_BAR_LINE));
    for (const [bar, room] of graceRoom.tail) widen(this.tail, bar, room);
    this.roomBefore = [0];
    this.lead.forEach((lead, i) => this.roomBefore.push(this.roomBefore[i]! + lead + this.tail[i]!));
    this.barIndices = score ? tapeBars(score).starts.map((_, i) => i) : [];
    this.gutterSpaces = fitGutter(score);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.space = Math.min(MAX_SPACE_PX, Math.max(MIN_SPACE_PX, height / CONTENT_HEIGHT));
  }

  gutterWidth(): number {
    return this.gutterSpaces * this.space;
  }

  /** Bar width in pixels: about two bars on the tape, so phones see what comes next too. */
  barWidth(): number {
    const tapeWidth = this.width - this.gutterWidth();
    const spaces = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, tapeWidth / BARS_VISIBLE / this.space));
    return spaces * this.space;
  }

  /**
   * Pixels along the tape for `x` in bar units (a full bar is 1). Bars with a key or time change
   * have room for it before their first note, so everything after them moves right by that much.
   */
  px(x: number): number {
    const score = this.score;
    if (!score) return x * this.barWidth();
    const bar = tapeBarAt(tapeBars(score).starts, x);
    return x * this.barWidth() + this.roomAt(bar) * this.space;
  }

  /**
   * Pixels along the tape for a beat along the page, in printed bar `bar` (the bar the beat falls
   * in, unless said: the very end of a bar belongs to it, not to the next one).
   */
  at(beat: number, bar?: number): number {
    const score = this.score;
    return score ? this.px(beatPosition(score, bar ?? barAtBeat(score, beat), beat)) : 0;
  }

  /** As `at`, for an edge of a stretch of music (see edgeX): at a bar start, that bar's line. */
  edgeAt(beat: number, bar?: number): number {
    const score = this.score;
    return score ? this.edgeX(beatPosition(score, bar ?? barAtBeat(score, beat), beat)) : 0;
  }

  /**
   * The place on the page at `px` along the tape, the inverse of px: the printed bar whose bar line
   * is at or before it, and the beat there. Null before the first bar line.
   */
  pageAt(px: number): { bar: number; beat: number } | null {
    const score = this.score;
    if (!score || this.barIndices.length === 0) return null;
    const bar = lastAtOrBefore(this.barIndices, px, (i) => this.barLineX(i));
    if (bar < 0) return null;
    const x = (px - this.roomAt(bar) * this.space) / this.barWidth();
    return { bar, beat: beatAtPosition(score, bar, x) };
  }

  /** Where bar `index`'s bar line is drawn (index = the number of bars: the final bar line). */
  barLineX(index: number): number {
    const score = this.score;
    if (!score) return 0;
    const tape = tapeBars(score);
    const x = tape.starts[index] ?? tape.end;
    return x * this.barWidth() + (this.roomBefore[index] ?? this.roomBefore.at(-1) ?? 0) * this.space - BAR_LINE_GAP * this.space;
  }

  /** An edge of a stretch of music (a loop, a bracket) at `x` in bar units: at a bar start, that bar's line. */
  edgeX(x: number): number {
    const score = this.score;
    if (!score) return 0;
    const starts = tapeBars(score).starts;
    const bar = tapeBarAt(starts, x);
    return Math.abs((starts[bar] ?? 0) - x) < 1e-6 ? this.barLineX(bar) : this.px(x) - BAR_LINE_GAP * this.space;
  }

  /** Cursor position inside the tape. */
  cursorX(): number {
    return (this.width - this.gutterWidth()) * CURSOR_AT;
  }

  trebleTop(): number {
    const systemHeight = (2 * (LINES_PER_STAFF - 1) + STAFF_GAP) * this.space;
    return (this.height - systemHeight) / 2;
  }

  bassTop(): number {
    return this.trebleTop() + (LINES_PER_STAFF - 1 + STAFF_GAP) * this.space;
  }

  staffTop(staff: Clef): number {
    return staff === 'treble' ? this.trebleTop() : this.bassTop();
  }

  systemBottom(): number {
    return this.bassTop() + (LINES_PER_STAFF - 1) * this.space;
  }

  /** The room before bar `bar`'s first note, in staff spaces: at all the bar lines up to it, and its own lead. */
  private roomAt(bar: number): number {
    return (this.roomBefore[bar] ?? 0) + (this.lead[bar] ?? 0);
  }
}

/** Width of a key signature in staff spaces, including the gap after it. */
export function keySignatureWidth({ fifths }: Pick<KeySignature, 'fifths'>): number {
  if (fifths === 0) return 0;
  return Math.abs(fifths) * (fifths > 0 ? SHARP_ADVANCE : FLAT_ADVANCE) + SIGNATURE_GAP;
}

/** Width of a time signature in staff spaces, set by its longer number (e.g. 12 in 12/8). */
export function timeSignatureWidth({ numerator, denominator }: TimeSignature): number {
  return Math.max(String(numerator).length, String(denominator).length) * TIME_DIGIT_WIDTH;
}

/** Room for the clefs plus the widest key and time signatures that occur in the piece. */
function fitGutter(score: Score | null): number {
  if (!score || score.notes.length === 0) return CLEF_AREA + GUTTER_END_GAP;
  const keyWidth = Math.max(...score.notation.keySignatures.map((key) => keySignatureWidth(key)));
  const timeWidth = Math.max(...score.notation.timeSignatures.map((time) => timeSignatureWidth(time)));
  return CLEF_AREA + keyWidth + timeWidth + GUTTER_END_GAP;
}

/** The room a key or time change needs before the bar's first note, in staff spaces. */
function signatureChangeWidth(change: SignatureChange): number {
  let width = CHANGE_GAP_BEFORE + CHANGE_GAP_AFTER;
  if (change.key) {
    const naturals = cancelledSteps(change.key.from, change.key.to, 'treble').length;
    width += naturals * NATURAL_ADVANCE + (naturals > 0 ? SIGNATURE_GAP : 0);
    width += keySignatureWidth({ fifths: change.key.to });
  }
  if (change.time) width += timeSignatureWidth(change.time) + SIGNATURE_GAP;
  return width;
}

/** The bar (index into `starts`) whose start is at or before `x` on the tape (the first one before it). */
function tapeBarAt(starts: readonly number[], x: number): number {
  return Math.max(0, lastAtOrBefore(starts, x + 1e-9, (start) => start));
}
