import type { StaffGeometry } from './geometry';
import { tenth } from './svg';

/*
 * The staff stretched through sizes on the move (a window dragged by its edge, a browser's bars
 * sliding away on a phone), where drawing the piece anew takes longer than a frame: drawn anew at
 * the first step, the steps after it would be missed. What is drawn is stretched to each new size,
 * which costs nothing, and drawn anew once the size has come to rest.
 */

/** A size not told again for this long, in milliseconds, has come to rest. */
const RESIZING_MS = 120;

/** What of the staff is stretched: the left column, the tape, the cursor. */
export interface StretchedParts {
  readonly background: SVGSVGElement;
  readonly tape: HTMLElement;
  readonly cursor: HTMLElement;
}

export class TapeStretch {
  private stretched = false;
  /** How much larger than drawn it is shown. */
  private scale = 1;
  /** How wide the tape in sight is, in what is drawn. */
  private tape = 0;
  /** How far the music is moved along the tape, in what is drawn, to stand under the cursor where it will be drawn anew. */
  private moved = 0;
  private settling: ReturnType<typeof setTimeout> | undefined;

  /** `rested`: the size has come to rest, the stretch is undone; what is drawn is to be drawn anew for it. */
  constructor(
    private readonly geometry: StaffGeometry,
    private readonly parts: StretchedParts,
    private readonly rested: () => void,
  ) {}

  /** Whether what is drawn is stretched now. */
  get on(): boolean {
    return this.stretched;
  }

  /** How much larger than drawn it is shown (1 when not stretched). */
  get by(): number {
    return this.scale;
  }

  /** How far the music is moved along the tape, in what is drawn (0 when not stretched). */
  get shift(): number {
    return this.moved;
  }

  /** How wide the tape in sight is, in what is drawn: wider while stretched smaller. */
  get tapeInSight(): number {
    return this.stretched ? this.tape : this.geometry.width - this.geometry.gutterWidth();
  }

  /**
   * Shows what is drawn as it would stand in a view of `width`×`height`, near enough: larger or
   * smaller as the staff would be, in the middle of the height, the music under the cursor where
   * that will stand, and the tape faded at what will be its ends. (Near enough: the bars would be
   * laid out a little wider or narrower. Drawn anew, they are.) Undone once no new size is told.
   */
  to(width: number, height: number): void {
    const { geometry, parts } = this;
    const by = geometry.spaceFor(width, height) / geometry.space;
    const down = tenth(height / 2 - (by * geometry.height) / 2);
    // The tape is boxed as it will be, in what is drawn: from the left column (stretched with the
    // rest) to the view's edges. Its fade, and the edge that cuts it, go with the box.
    const tape = (width - by * geometry.gutterWidth()) / by;
    this.moved = tenth(geometry.cursorAt * (tape - (geometry.width - geometry.gutterWidth())));
    this.scale = by;
    this.tape = tape;
    parts.tape.style.right = `${width - geometry.gutterWidth() - tape}px`;
    parts.tape.style.bottom = `${height - height / by}px`;
    if (!this.stretched) {
      this.stretched = true;
      // The left column reaches past its box while that is smaller than the view: nothing cuts it there.
      parts.background.style.overflow = 'visible';
    }
    for (const part of [parts.background, parts.tape, parts.cursor]) {
      // (Each about the view's own corner, wherever in the view it stands.)
      const left = part instanceof HTMLElement ? part.offsetLeft : 0;
      const top = part instanceof HTMLElement ? part.offsetTop : 0;
      part.style.transformOrigin = `${-left}px ${-top}px`;
      part.style.transform = `translate(0px, ${down}px) scale(${by})`;
    }
    clearTimeout(this.settling);
    this.settling = setTimeout(() => this.undo(), RESIZING_MS);
  }

  private undo(): void {
    const { parts } = this;
    this.stretched = false;
    for (const part of [parts.background, parts.tape, parts.cursor]) {
      part.style.transform = '';
      part.style.transformOrigin = '';
    }
    this.moved = 0;
    this.scale = 1;
    this.tape = 0;
    parts.tape.style.right = '0';
    parts.tape.style.bottom = '0';
    parts.background.style.overflow = '';
    this.rested();
  }
}
