import { barAtBeat, type KeySignature, type Score, type TimeSignature } from '../../../domain/score';
import { lastAtOrBefore } from '../../../domain/search';
import { cancelledSteps, signatureChanges, type SignatureChange } from '../../../domain/notation/signatures';
import { momentIn, placeIn, spaceBar, type BarSpacing, type Column } from '../../../domain/notation/spacing';
import { beatAtPosition, beatPosition, tapeBars, type Clef } from '../staffLayout';
import { SAME_MOMENT, sameMoment } from '../../../domain/moment';

/*
 * All sizes are in staff spaces (the distance between two staff lines),
 * so the whole staff scales with the height of the view.
 */
export const LINES_PER_STAFF = 5;
/** Between the bottom line of the treble staff and the top line of the bass staff. */
const STAFF_GAP = 6;
/** The two staves and the gap between them. */
const SYSTEM_HEIGHT = 2 * (LINES_PER_STAFF - 1) + STAFF_GAP;
/**
 * Room over the upper staff and under the lower one, at the least: for a bar number over the top
 * line (it stands a little over two spaces up) and a ledger line under the bottom one. What a piece
 * has further out, its notes, words, dynamics and pedal, it has room for by itself (see setScore's
 * reach). Five spaces once, two fifths of the height whatever the piece: three, measured against
 * the Ode, the showcase holding nothing cut off (tests/staffInSight.test.ts).
 */
const ROOM_BEYOND = 3;
const MIN_SPACE_PX = 6;
/**
 * The staff no larger than this, between two lines: chosen by eye against 1280 × 800, of 14, 18
 * and 22 (the Ode's two staves 196, 252 and 308 px high in a stage of 656). At 14 it stood small in
 * the middle of an empty stage; at 22 it is larger than one reads music at.
 */
const MAX_SPACE_PX = 18;
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
 * Notes sit on the tape where their moment is, so the cursor crosses a notehead when it sounds;
 * a bar is as wide as its time, or wider where its notes are crowded (domain/notation/spacing.ts).
 * Bar lines are drawn a little before the bar's first beat to leave room for its note.
 */
export const BAR_LINE_GAP = 1.4;
/** The cursor stands at this share of the tape's width, leaving room to read ahead. */
const READING_AHEAD = 0.3;

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
  /** Where the cursor stands, as a share of the tape's width. */
  cursorAt = READING_AHEAD;
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
  /** What stands in each printed bar, and the bars set out by it for the view's size: each one's marks, and where its first beat is along the tape (without the room at bar lines). */
  private columns: readonly (readonly Column[])[] = [];
  /** Room over the upper staff and under the lower one, in staff spaces: as much as the piece reaches (see setScore). */
  private roomAbove = ROOM_BEYOND;
  private roomBelow = ROOM_BEYOND;
  private bars: BarSpacing[] = [];
  private barStarts: number[] = [0];

  /**
   * `graceRoom`: what the grace notes at the start and at the end of each printed bar need (see
   * setScore's callers). `columns`: what stands in each printed bar (see staff/columns.ts).
   * `reach`: how far the piece goes beyond its staves, in staff steps (see the engraving's reachOf):
   * the staff is sized so that its highest and its lowest are in sight.
   */
  setScore(
    score: Score | null,
    {
      graceRoom = NO_GRACES,
      columns = [],
      reach = { above: 0, below: 0 },
    }: {
      graceRoom?: { lead: ReadonlyMap<number, number>; tail: ReadonlyMap<number, number> };
      columns?: readonly (readonly Column[])[];
      reach?: { above: number; below: number };
    } = {},
  ): void {
    this.score = score;
    this.columns = columns;
    this.roomAbove = Math.max(ROOM_BEYOND, reach.above / 2);
    this.roomBelow = Math.max(ROOM_BEYOND, reach.below / 2);
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
    this.fit();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.fit();
  }

  /**
   * The staff is as large as the height allows, but no larger than leaves BARS_VISIBLE of the
   * narrowest bars on the tape: on a tall and narrow view (a phone held upright) a staff sized by
   * the height alone would show hardly more than a bar.
   */
  private fit(): void {
    this.space = this.spaceFor(this.width, this.height);
    // The bars set out anew: how wide an uncrowded bar is depends on the view's width.
    const tape = this.score ? tapeBars(this.score) : null;
    const natural = this.barWidth() / this.space;
    this.bars = (tape?.widths ?? []).map((share, bar) => spaceBar(this.columns[bar] ?? [], share * natural));
    this.barStarts = [0];
    for (const bar of this.bars) this.barStarts.push(this.barStarts.at(-1)! + bar.width);
  }

  /** The staff space a view of this size would be drawn with (see `fit`). */
  spaceFor(width: number, height: number): number {
    const byHeight = height / (SYSTEM_HEIGHT + this.roomAbove + this.roomBelow);
    const byWidth = width / (this.gutterSpaces + BARS_VISIBLE * MIN_BAR_WIDTH);
    return Math.min(MAX_SPACE_PX, Math.max(MIN_SPACE_PX, Math.min(byHeight, byWidth)));
  }

  gutterWidth(): number {
    return this.gutterSpaces * this.space;
  }

  /** The width of a bar that is not crowded, in pixels: about two such bars on the tape, so phones see what comes next too. */
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
    const tape = tapeBars(score);
    const bar = tapeBarAt(tape.starts, x);
    const spacing = this.bars[bar];
    if (!spacing) return x * this.barWidth();
    const at = (x - tape.starts[bar]!) / (tape.widths[bar] || 1);
    return (this.barStarts[bar]! + this.roomAt(bar) + placeIn(spacing, at)) * this.space;
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
    const tape = tapeBars(score);
    const spacing = this.bars[bar];
    if (!spacing) return null;
    const at = momentIn(spacing, px / this.space - this.barStarts[bar]! - this.roomAt(bar));
    return { bar, beat: beatAtPosition(score, bar, tape.starts[bar]! + at * tape.widths[bar]!) };
  }

  /** Where bar `index`'s bar line is drawn (index = the number of bars: the final bar line). */
  barLineX(index: number): number {
    const score = this.score;
    if (!score) return 0;
    const start = this.barStarts[Math.min(index, this.barStarts.length - 1)] ?? 0;
    return (start + (this.roomBefore[index] ?? this.roomBefore.at(-1) ?? 0) - BAR_LINE_GAP) * this.space;
  }

  /** An edge of a stretch of music (a loop, a bracket) at `x` in bar units: at a bar start, that bar's line. */
  edgeX(x: number): number {
    const score = this.score;
    if (!score) return 0;
    const starts = tapeBars(score).starts;
    const bar = tapeBarAt(starts, x);
    return sameMoment(starts[bar] ?? 0, x) ? this.barLineX(bar) : this.px(x) - BAR_LINE_GAP * this.space;
  }

  /** Cursor position inside the tape. */
  cursorX(): number {
    return (this.width - this.gutterWidth()) * this.cursorAt;
  }

  /** The top line of the upper staff: what the piece needs is in the middle of the height, the room over the staff above this. */
  trebleTop(): number {
    const content = (SYSTEM_HEIGHT + this.roomAbove + this.roomBelow) * this.space;
    return (this.height - content) / 2 + this.roomAbove * this.space;
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
  return Math.max(0, lastAtOrBefore(starts, x + SAME_MOMENT, (start) => start));
}

/** To a tenth of a pixel: what moves less is the noise of arithmetic, not a move to show. */
export const tenth = (px: number): number => Math.round(px * 10) / 10;
