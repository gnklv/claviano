import type { StaffColors } from '../../application/ports/StaffView';
import type { StaffChord, StaffGrace } from '../../domain/notation/engraving';
import type { Hand } from '../../domain/note';
import { FontsComing } from './staff/fontsComing';
import { LABEL_FONT, MUSIC_FONT, TEXT_FONT } from './staff/glyphs';
import { paintShape, type Colours } from './staff/paint';
import { COLORS, extentOf, type GroupShape, type Paint, type Shape } from './staff/shapes';
import type { Lit } from './staff/sounding';
import type { TapeDrawing } from './staff/tapeDrawing';
import { TapeTiles, type TapePiece } from './staff/tapeTiles';
import { TapeStaff, type StaffSurface } from './TapeStaff';

/*
 * The staff drawn on canvases (see TapeStaff for what it shows and does). The tape is drawn in
 * pictures ahead of the view (TapeTiles), and a frame only lays them, with what is behind the music
 * and what sounds over it: nothing in a frame draws the whole piece, or asks the browser to. (It was
 * one SVG once, moved as a layer: Safari painted the layer anew every few bars and at every lit
 * note, and the tape stumbled on an iPhone.)
 *
 * A canvas does not follow the theme's colours by itself, nor draws in a font before it has come:
 * it is given the colours (anew when the theme changes, as the falling notes are), and what is drawn
 * is drawn anew once the fonts are in.
 */

/** Share of the tape's width over which each of its ends fades out. */
const FADE = 0.12;
/** The fonts the staff draws in: asked for at once, for the canvas cannot ask for them itself. */
const FONTS = [`16px ${MUSIC_FONT}`, `16px ${TEXT_FONT}`, `italic 16px ${TEXT_FONT}`, `bold 16px ${TEXT_FONT}`, `italic bold 16px ${TEXT_FONT}`, `16px ${LABEL_FONT}`];

class CanvasSurface implements StaffSurface {
  readonly background = document.createElement('canvas');
  private readonly tapeCanvas = document.createElement('canvas');
  readonly tapeParts: readonly Element[] = [this.tapeCanvas];

  private readonly tiles = new TapeTiles(
    (ctx, piece) => paintShape(ctx, piece.shape, this.colours, this.colours(piece.color)),
    () => document.createElement('canvas'),
  );
  private colors: StaffColors | null = null;
  /** What a colour of the staff is in the theme now. */
  private readonly colours: Colours = (paint) => {
    const colors = this.colors;
    if (!colors) return 'transparent';
    if (paint === 'right' || paint === 'left') return colors.hand[paint];
    return paint === 'currentColor' || paint === 'none' ? 'transparent' : colors[paint];
  };

  private height = 0;
  private density = 1;
  private backgroundShapes: readonly Shape[] = [];
  private chords: readonly GroupShape[] = [];
  private graces: readonly GroupShape[] = [];
  private sounds: { readonly chords: readonly StaffChord[]; readonly graces: readonly StaffGrace[] } = { chords: [], graces: [] };
  private overlay: readonly Shape[] = [];
  private loop: readonly Shape[] = [];
  private lit: Lit = { chords: [], graces: [] };
  private offset = 0;
  private inSight = 0;
  /** Drawn anew once its fonts can be drawn with, if it was drawn before (see fontsComing). */
  private readonly fonts = new FontsComing(FONTS, () => this.drawAnew());

  constructor() {
    Object.assign(this.background.style, { position: 'absolute', inset: '0' });
    this.tapeCanvas.style.display = 'block';
  }

  setColors(colors: StaffColors): void {
    this.colors = colors;
    this.drawAnew();
  }

  sized(width: number, height: number, tapeLeft: number): void {
    this.height = height;
    this.density = window.devicePixelRatio || 1;
    fit(this.background, width, height, this.density);
    // (A size of its own, not its box's: stretched through sizes on the move, it is not drawn out of shape.)
    fit(this.tapeCanvas, width - tapeLeft, height, this.density);
  }

  showBackground(shapes: readonly Shape[]): void {
    this.backgroundShapes = shapes;
    this.fonts.drawing();
    const ctx = this.background.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.background.width, this.background.height);
    ctx.setTransform(this.density, 0, 0, this.density, 0, 0);
    for (const shape of shapes) paintShape(ctx, shape, this.colours, this.colours(COLORS.note));
  }

  showTape(drawing: TapeDrawing | null, sounds: { readonly chords: readonly StaffChord[]; readonly graces: readonly StaffGrace[] }): void {
    this.sounds = sounds;
    this.lit = { chords: [], graces: [] };
    this.chords = drawing?.chords ?? [];
    this.graces = drawing?.graces ?? [];
    const pieces: TapePiece[] = [];
    if (drawing) {
      const add = (shapes: readonly Shape[], color: Paint | undefined) => {
        for (const shape of shapes) pieces.push({ shape, extent: extentOf(shape), color: color ?? COLORS.note });
      };
      add(drawing.lines, COLORS.note);
      add(drawing.rests.children, drawing.rests.color);
      add(drawing.chords, COLORS.note);
      add(drawing.graces, COLORS.note);
      add(drawing.beams.children, drawing.beams.color);
    }
    this.tiles.set(pieces, this.height, this.density);
  }

  showOverlay(shapes: readonly Shape[]): void {
    this.overlay = shapes;
    this.paint();
  }

  showLoop(shapes: readonly Shape[]): void {
    this.loop = shapes;
    this.paint();
  }

  light(lit: Lit): void {
    if (lit === this.lit) return;
    this.lit = lit;
    this.paint();
  }

  move(offset: number, inSight: number): void {
    this.offset = offset;
    this.inSight = inSight;
    this.paint();
  }

  /** The tape in sight: what is behind the music, the pictures of it, what sounds over it, and its ends faded. */
  private paint(): void {
    this.fonts.drawing();
    const ctx = this.tapeCanvas.getContext('2d');
    if (!ctx) return;
    const { density } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.tapeCanvas.width, this.tapeCanvas.height);
    // (Laid on whole device pixels: a picture laid between them is drawn blurred.)
    const offset = Math.round(this.offset * density) / density;
    ctx.setTransform(density, 0, 0, density, offset * density, 0);
    const ink = this.colours(COLORS.note);
    for (const shape of this.loop) paintShape(ctx, shape, this.colours, ink);
    for (const shape of this.overlay) paintShape(ctx, shape, this.colours, ink);
    this.tiles.lay(ctx, -offset, this.inSight);
    // Lit: what the group holds, drawn again in its hand's colour over its own ink.
    const lightUp = (group: GroupShape | undefined, hand: Hand | undefined) => {
      if (!group || !hand) return;
      const colour = this.colours(COLORS.hand[hand]);
      for (const child of group.children) paintShape(ctx, child, this.colours, colour);
    };
    for (const index of this.lit.chords) lightUp(this.chords[index], this.sounds.chords[index]?.hand);
    for (const index of this.lit.graces) lightUp(this.graces[index], this.sounds.graces[index]?.hand);
    this.fade(ctx);
  }

  /** The tape fades out at both its ends: the music comes into sight, and goes out of it, gently. */
  private fade(ctx: CanvasRenderingContext2D): void {
    const width = this.tapeCanvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(FADE, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1 - FADE, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, this.tapeCanvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Everything drawn anew: the colours or the fonts have changed. */
  private drawAnew(): void {
    this.tiles.forget();
    this.showBackground(this.backgroundShapes);
    this.paint();
  }
}

/** A canvas of `width`×`height` pixels on the page, of as many device pixels as it is shown at. */
function fit(canvas: HTMLCanvasElement, width: number, height: number, density: number): void {
  const backing = [Math.max(1, Math.round(width * density)), Math.max(1, Math.round(height * density))] as const;
  if (canvas.width !== backing[0]) canvas.width = backing[0];
  if (canvas.height !== backing[1]) canvas.height = backing[1];
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

/** The staff drawn on canvases. */
export class CanvasStaff extends TapeStaff {
  /** `colors`: the theme's, as the interface reads them (and gives anew on a switch: setColors). */
  constructor(container: HTMLElement, colors: StaffColors) {
    super(container, new CanvasSurface(), colors);
  }
}
