import type { Paint, Shape } from './shapes';

/*
 * The tape on a canvas, as pictures: each stretch of it is drawn once, the first time it comes near
 * the view, and at every frame the pictures in sight are only laid side by side. What costs is
 * drawing a picture; it is done ahead of the view, one at a frame, so a frame never draws the music
 * itself. (Laying a picture is what the falling notes do at every frame, and they are smooth.)
 */

/** A stretch of tape this wide is one picture, in pixels: a few bars, small enough to draw within a frame. */
const TILE_PX = 512;
/** Pictures are drawn this far ahead of the view, in widths of the view: the music comes from the right. */
const AHEAD = 1;
/** Pictures further than this from the view, in widths of it, are let go of: on a phone each takes megabytes. */
const KEPT = 2;

/** A shape of the tape, with where it lies along it (null: everywhere) and the colour it takes for `currentColor` (a theme's). */
export interface TapePiece {
  readonly shape: Shape;
  readonly extent: [number, number] | null;
  readonly color: Paint;
}

export class TapeTiles {
  private pieces: readonly TapePiece[] = [];
  private readonly drawn = new Map<number, HTMLCanvasElement>();
  /** Pictures let go of, kept to be drawn on again: a canvas made anew costs more than one cleared. */
  private readonly spare: HTMLCanvasElement[] = [];
  private height = 0;
  private density = 1;

  /** `paint`: draws a piece in tape pixels; `make`: a canvas for a picture. */
  constructor(
    private readonly paint: (ctx: CanvasRenderingContext2D, piece: TapePiece) => void,
    private readonly make: () => HTMLCanvasElement,
  ) {}

  /** The tape anew: its shapes, how tall it is, and how many device pixels a pixel is. */
  set(pieces: readonly TapePiece[], height: number, density: number): void {
    this.forget();
    this.pieces = pieces;
    this.height = height;
    this.density = density;
  }

  /** Every picture is drawn anew when next laid (the colours have changed, a font has come). */
  forget(): void {
    for (const canvas of this.drawn.values()) this.spare.push(canvas);
    this.drawn.clear();
  }

  /**
   * Lays the pictures in sight, from `left` along the tape, `width` of it (in tape pixels, on a
   * context set to them); then draws one picture more ahead, if one is still to be drawn.
   */
  lay(ctx: CanvasRenderingContext2D, left: number, width: number): void {
    // (Nothing to lay before the tape has a size: the staff is told its colours before its size.)
    if (this.height <= 0 || width <= 0) return;
    const first = Math.floor(left / TILE_PX);
    const last = Math.floor((left + width) / TILE_PX);
    for (let i = first; i <= last; i++) {
      const picture = this.picture(i);
      if (picture) ctx.drawImage(picture, i * TILE_PX, 0, TILE_PX, this.height);
    }
    const ahead = Math.floor((left + width + AHEAD * width) / TILE_PX);
    for (let i = last + 1; i <= ahead; i++) {
      if (this.drawn.has(i)) continue;
      this.picture(i);
      break;
    }
    const from = Math.floor((left - KEPT * width) / TILE_PX);
    const to = Math.floor((left + width + KEPT * width) / TILE_PX);
    for (const [i, canvas] of this.drawn) {
      if (i >= from && i <= to) continue;
      this.drawn.delete(i);
      this.spare.push(canvas);
    }
  }

  /** The picture of stretch `i`, drawn now if it is not yet. */
  private picture(i: number): HTMLCanvasElement | null {
    const kept = this.drawn.get(i);
    if (kept) return kept;
    const canvas = this.spare.pop() ?? this.make();
    const width = Math.ceil(TILE_PX * this.density);
    const height = Math.ceil(this.height * this.density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const left = i * TILE_PX;
    const right = left + TILE_PX;
    ctx.setTransform(this.density, 0, 0, this.density, -left * this.density, 0);
    for (const piece of this.pieces) {
      if (piece.extent && (piece.extent[1] < left || piece.extent[0] > right)) continue;
      this.paint(ctx, piece);
    }
    this.drawn.set(i, canvas);
    return canvas;
  }
}
