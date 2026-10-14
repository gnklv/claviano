/*
 * Only the stretch of the tape near the view is left to the browser. A piece of many pages is
 * thousands of shapes, and every frame the tape moves the browser would lay out and paint them all.
 * The whole piece is still engraved at once (what stands around a note is placed against its
 * neighbours); the shapes far from the view are only hidden, and shown again as the tape comes to them.
 */

/** How far past each edge of the view the tape is shown, in widths of the view. */
const BEYOND = 1;
/**
 * How far the view moves before what is shown is chosen again, in widths of the view: less than
 * BEYOND, so that what comes into the view has always been shown already.
 */
const STEP = 0.5;

interface Piece {
  readonly element: SVGGraphicsElement;
  readonly left: number;
  readonly right: number;
  shown: boolean;
}

export class TapeWindow {
  private pieces: Piece[] = [];
  /** Where along the tape the view was when what is shown was last chosen. */
  private at = Number.NaN;
  private width = 0;

  /** The tape's shapes, just drawn and all shown: where each lies along the tape. */
  measure(elements: Iterable<SVGGraphicsElement>): void {
    this.pieces = [];
    this.at = Number.NaN;
    for (const element of elements) {
      const box = typeof element.getBBox === 'function' ? element.getBBox() : null;
      // A shape with no size here is always shown: it has nothing to draw, or the page is not laid out.
      const sized = box !== null && (box.width > 0 || box.height > 0);
      this.pieces.push({ element, left: sized ? box.x : Number.NEGATIVE_INFINITY, right: sized ? box.x + box.width : Number.POSITIVE_INFINITY, shown: true });
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
