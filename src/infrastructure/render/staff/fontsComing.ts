import { MUSIC_FONT } from './glyphs';

/*
 * The staff's fonts, as a canvas can draw with them. A canvas draws on with a stand-in for a font
 * that is not there (the music font's signs as empty boxes), and does not draw anew when it comes.
 * Nor do fonts come once for good: when the screen changes (another density, a phone's view and
 * back) the page reads its fonts anew, and for a moment has none; a staff drawn anew for the new
 * screen then came out in boxes, and stayed so. So each drawing asks the canvas itself whether it
 * draws in them (the music font's sign measures as its own, not as a stand-in's box), and one made
 * without them is drawn anew once they can be drawn with, on whichever word comes first: a load
 * done, the page's fonts ready, a load asked for settling. Any of them may come before the others,
 * or before this listens; none is waited for by a clock.
 */

/** A sign of the music font (the G clef), measured at a size where a box and the sign differ. */
const SIGN = '';
const PROBE = '20px';
/** What a canvas draws a sign with when the music font is not there, as far as its width tells. */
const STAND_IN = 'monospace';

export class FontsComing {
  /** A drawing was made without them: drawn anew when they come. */
  private waiting = false;
  /** A canvas's pen of its own, to measure with. */
  private readonly pen = document.createElement('canvas').getContext('2d');

  /** `fonts`: what the staff draws in, asked for at once (a canvas cannot ask for them itself). `drawAnew`: what was drawn, drawn again. */
  constructor(
    private readonly fonts: readonly string[],
    private readonly drawAnew: () => void,
  ) {
    for (const font of fonts) void document.fonts?.load(font).then(this.mend, () => undefined);
  }

  /** Told as something is drawn: drawn without the fonts, it is drawn anew when they come. */
  drawing(): void {
    if (!this.drawable()) this.wait();
  }

  private wait(): void {
    const set = document.fonts;
    if (this.waiting || !set) return;
    this.waiting = true;
    set.addEventListener('loadingdone', this.mend);
    void set.ready.then(this.mend);
  }

  private readonly mend = (): void => {
    if (!this.waiting || !this.drawable()) return;
    this.waiting = false;
    document.fonts.removeEventListener('loadingdone', this.mend);
    this.drawAnew();
  };

  /** Whether the canvas draws in the staff's fonts now: the page has them, and the music font's sign is not a stand-in's. */
  private drawable(): boolean {
    const set = document.fonts;
    if (set && !this.fonts.every((font) => set.check(font))) return false;
    const pen = this.pen;
    if (!pen) return true;
    pen.font = `${PROBE} ${MUSIC_FONT}, ${STAND_IN}`;
    const own = pen.measureText(SIGN).width;
    pen.font = `${PROBE} ${STAND_IN}`;
    return own !== pen.measureText(SIGN).width;
  }
}
