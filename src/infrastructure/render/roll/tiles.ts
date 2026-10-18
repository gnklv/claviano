import type { RollFrame } from '../../../application/ports/RollView';
import type { Fingering } from '../../../domain/fingering/own';
import { noteEnd } from '../../../domain/note';
import { firstNoteAtOrAfter, type Score } from '../../../domain/score';
import { MUTED_ALPHA, type RollPen } from './ink';
import type { KeyRect } from './keyboard';

/* The notes as tiles falling onto their keys: drawn, with their fingers, and found under a press. */

/**
 * A note's tile (pixels, by eye): its corners, how far in from its key's edges it stands (neighbours
 * kept apart; a black key's tile less, it is narrow), and how short it gets (the shortest note seen).
 */
const TILE = { radius: 4, inset: { white: 2, black: 1 }, shortest: 2 };
/** A press this near a tile, beside it or past its end, is on it: a fingertip is wider than a black key's tile (pixels). */
const TILE_SNAP_PX = 6;
/** The ring round a picked tile, and how far out from it (pixels). */
const PICKED_RING_PX = 2;
/** A finger printed on a tile: this tall, as large as reads from the bench, and not printed where a tile is too narrow for a figure this small (pixels). */
const FINGER_PX = 18;
const MIN_FINGER_PX = 9;
/** The figures' face, as wide as each system draws it (measured there: see fingerSize). */
const fingerFont = (size: number): string => `600 ${size}px system-ui, sans-serif`;
/** How pale a fingering hint is printed, as on the staff. */
const HINT_ALPHA = 0.6;
/** A figure stands this far up from its tile's end, and has this much room to spare across it (pixels). */
const FINGER_CLEARANCE_PX = 2;

/** Where the tiles stand: the keys, and how the music's time is turned into height. */
export interface TileView {
  readonly keys: ReadonlyMap<number, KeyRect>;
  readonly yOf: (time: number) => number;
  readonly rollHeight: number;
  /** How far ahead is in sight. */
  readonly until: number;
  /** The longest note of the piece: how far back to look for one still sounding. */
  readonly longestNote: number;
  /** One size for every finger (see fingerSize). */
  readonly fingerSize: number;
}

/**
 * One size for every finger: the largest whose widest figure fits across the narrowest tile (a black
 * key's), in the face this system draws.
 */
export function fingerSize(ctx: CanvasRenderingContext2D, keys: ReadonlyMap<number, KeyRect>): number {
  ctx.font = fingerFont(100);
  const digitWidth = Math.max(...['1', '2', '3', '4', '5'].map((figure) => ctx.measureText(figure).width)) / 100;
  return Math.min(FINGER_PX, (Math.min(...[...keys.values()].map((key) => key.width)) - FINGER_CLEARANCE_PX) / digitWidth);
}

/** The notes in sight, each on its key; a muted hand's faint; the one being fingered ringed. */
export function drawTiles(pen: RollPen, frame: RollFrame, view: TileView): void {
  const { ctx, colors } = pen;
  const { score, position } = frame;
  const { keys, yOf, rollHeight } = view;
  const { notes } = score;
  // A tile is as long as its note is written: a repeated note's tiles touch. (That the finger
  // leaves the key between them is shown on the keyboard.)
  for (let i = firstNoteAtOrAfter(score, position - view.longestNote); i < notes.length; i++) {
    const note = notes[i]!;
    if (note.start > view.until) break;
    const end = noteEnd(note);
    if (end < position) continue;
    const key = keys.get(note.pitch);
    if (!key) continue;

    const enabled = frame.isHandEnabled(note.hand);
    const top = yOf(end);
    const bottom = Math.min(rollHeight, yOf(note.start));
    const inset = key.black ? TILE.inset.black : TILE.inset.white;
    if (frame.picked?.includes(i)) drawPicked(pen, key.x + inset, top, key.width - inset * 2, bottom - top);
    ctx.globalAlpha = enabled ? 1 : MUTED_ALPHA;
    ctx.fillStyle = colors.hand[note.hand];
    ctx.beginPath();
    ctx.roundRect(key.x + inset, top, key.width - inset * 2, Math.max(TILE.shortest, bottom - top), TILE.radius);
    ctx.fill();
    const finger = frame.fingers?.[i];
    if (finger) drawFinger(pen, finger, key, top, bottom, enabled, view.fingerSize);
  }
  ctx.globalAlpha = 1;
}

/** The note being given a finger: a ring round its tile, as the staff rings its head. */
function drawPicked({ ctx, colors }: RollPen, x: number, top: number, width: number, height: number): void {
  // (Its pen is its own: the keys' borders are drawn after, with the pen as it is left.)
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.loopEdge;
  ctx.lineWidth = PICKED_RING_PX;
  ctx.beginPath();
  ctx.roundRect(x - PICKED_RING_PX, top - PICKED_RING_PX, width + PICKED_RING_PX * 2, Math.max(TILE.shortest, height) + PICKED_RING_PX * 2, TILE.radius + PICKED_RING_PX);
  ctx.stroke();
  ctx.restore();
}

/** A finger on its tile, at the end that comes to the key first; a hint paler, as on the staff. */
function drawFinger({ ctx, colors }: RollPen, finger: Fingering, key: KeyRect, top: number, bottom: number, enabled: boolean, size: number): void {
  // (Only where it can be read: on keys wide enough for a figure, on a tile long enough for it.)
  if (size < MIN_FINGER_PX || bottom - top < size + 2 * FINGER_CLEARANCE_PX) return;
  ctx.globalAlpha = (enabled ? 1 : MUTED_ALPHA) * (finger.hint ? HINT_ALPHA : 1);
  ctx.fillStyle = colors.whiteKey;
  ctx.font = fingerFont(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(finger.text, key.x + key.width / 2, bottom - FINGER_CLEARANCE_PX);
}

/**
 * The note (its place in `score.notes`) whose tile is at `x` across the keyboard and at `time`, or
 * near it: of those the press is on, the nearest across (a black key's tile stands over its
 * neighbours'). `pxPerSecond`: how tall a second is, to take a press just past a tile's end as on it.
 */
export function tileAt(score: Score, keys: ReadonlyMap<number, KeyRect>, longestNote: number, x: number, time: number, pxPerSecond: number): number | null {
  const snap = TILE_SNAP_PX / pxPerSecond;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = firstNoteAtOrAfter(score, time - snap - longestNote); i < score.notes.length; i++) {
    const note = score.notes[i]!;
    if (note.start > time + snap) break;
    const key = keys.get(note.pitch);
    if (!key || noteEnd(note) < time - snap) continue;
    const distance = Math.abs(x - (key.x + key.width / 2));
    if (distance > key.width / 2 + TILE_SNAP_PX) continue;
    if (distance < bestDistance || (distance === bestDistance && key.black)) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
