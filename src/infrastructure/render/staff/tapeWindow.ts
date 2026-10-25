/*
 * Only the stretch of the tape near the view is left to the browser. A piece of many pages is
 * thousands of shapes, and every frame the tape moves the browser would lay out and paint them all.
 * The whole piece is still engraved at once (what stands around a note is placed against its
 * neighbours); the shapes far from the view are only hidden, and shown again as the tape comes to them.
 *
 * Where a shape lies is read from what it was drawn with (extentOf), not asked of the browser: asking
 * would have it lay out every shape of the piece first, which is what hiding them is meant to spare.
 */

/** How far past each edge of the view the tape is shown, in widths of the view. */
const BEYOND = 1;
/**
 * How far the view moves before what is shown is chosen again, in widths of the view: less than
 * BEYOND, so that what comes into the view has always been shown already.
 */
const STEP = 0.5;

interface Piece {
  readonly element: SVGElement;
  readonly left: number;
  readonly right: number;
  shown: boolean;
}

export class TapeWindow {
  private pieces: Piece[] = [];
  /** Where along the tape the view was when what is shown was last chosen. */
  private at = Number.NaN;
  private width = 0;

  /** The tape's shapes, just drawn and all shown, with where each lies along the tape (null: everywhere, always shown). */
  measure(shapes: Iterable<{ readonly element: SVGElement; readonly extent: [number, number] | null }>): void {
    this.pieces = [];
    this.at = Number.NaN;
    for (const { element, extent } of shapes) {
      const [left, right] = extent ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
      this.pieces.push({ element, left, right, shown: true });
    }
  }

  /** The view now spans `left..left + width` along the tape. */
  view(left: number, width: number): void {
    if (Math.abs(left - this.at) < STEP * width && width === this.width) return;
    this.at = left;
    this.width = width;
    const from = left - BEYOND * width;
    const to = left + width + BEYOND * width;
    for (const piece of this.pieces) {
      const shown = piece.right >= from && piece.left <= to;
      if (shown === piece.shown) continue;
      piece.shown = shown;
      piece.element.style.display = shown ? '' : 'none';
    }
  }
}
