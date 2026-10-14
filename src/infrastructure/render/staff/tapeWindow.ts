/*
 * Only the stretch of the tape near the view is left to the browser. A piece of many pages is
 * thousands of shapes, and every frame the tape moves the browser would lay out and paint them all.
 * The whole piece is still engraved at once (what stands around a note is placed against its
 * neighbours); the shapes far from the view are only hidden, and shown again as the tape comes to them.
 *
 * Where a shape lies is read from what it was drawn with, not asked of the browser: asking would
 * have it lay out every shape of the piece first, which is what hiding them is meant to spare.
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

  /** The tape's shapes, just drawn and all shown: where each lies along the tape. */
  measure(elements: Iterable<SVGElement>): void {
    this.pieces = [];
    this.at = Number.NaN;
    for (const element of elements) {
      // A shape whose place cannot be read is always shown.
      const [left, right] = extent(element) ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
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

/** Where a shape and all within it lie along the tape, from the places it was drawn at; null where one of them cannot be read. */
function extent(shape: Element): [number, number] | null {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const element of [shape, ...shape.querySelectorAll('*')]) {
    const xs = placesOf(element);
    if (!xs) return null;
    for (const x of xs) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return left <= right ? [left, right] : null;
}

const number = (element: Element, name: string): number => Number(element.getAttribute(name) ?? 0);
/** Every other number of a list of points: the places along the tape. */
const alongOf = (numbers: string): number[] => (numbers.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);

/** The places along the tape a single element is drawn at (none for a group); null for what is not read. */
function placesOf(element: Element): number[] | null {
  switch (element.tagName.toLowerCase()) {
    case 'g':
      return [];
    case 'text': {
      // A sign is no wider than its font is high, letter by letter: room enough, without measuring it.
      const x = number(element, 'x');
      const wide = number(element, 'font-size') * (element.textContent?.length ?? 0);
      const anchor = element.getAttribute('text-anchor');
      const from = anchor === 'middle' ? x - wide / 2 : anchor === 'end' ? x - wide : x;
      return [from, from + wide];
    }
    case 'line':
      return [number(element, 'x1'), number(element, 'x2')];
    case 'rect':
      return [number(element, 'x'), number(element, 'x') + number(element, 'width')];
    case 'polygon':
    case 'polyline':
      return alongOf(element.getAttribute('points') ?? '');
    case 'path': {
      // Paths of points in pairs only (moves, lines and curves, drawn in place): others are not read.
      const d = element.getAttribute('d') ?? '';
      return /^[MLCQZ\d\s.,e-]*$/.test(d) ? alongOf(d) : null;
    }
    default:
      return null;
  }
}
