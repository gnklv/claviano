import type { StaffChord, StaffGrace } from '../../domain/notation/engraving';
import { ChordLights } from './staff/chordLights';
import { extentOf, type Shape } from './staff/shapes';
import type { Lit } from './staff/sounding';
import { svg, toSvg } from './staff/svg';
import type { TapeDrawing } from './staff/tapeDrawing';
import { TapeWindow } from './staff/tapeWindow';
import { TapeStaff, type StaffSurface } from './TapeStaff';

/*
 * The staff drawn in SVG (see TapeStaff for what it shows and does). The tape is one SVG, moved as a
 * layer of its own that the browser slides without drawing it again; only the stretch of it near the
 * view is shown (TapeWindow), and what sounds is lit on a layer over it (ChordLights).
 */

class SvgSurface implements StaffSurface {
  readonly background: SVGSVGElement = svg('svg');
  private readonly tapeSvg: SVGSVGElement = svg('svg');
  private readonly strip: SVGGElement = svg('g');
  /** Behind the music on the tape: the printed bar under the pointer, and bars being selected by dragging. */
  private readonly overlay: SVGGElement = svg('g');
  /** The loop's shade, behind the music too: redrawn alone when the loop changes. */
  private readonly loopLayer: SVGGElement = svg('g');
  private readonly nearView = new TapeWindow();
  private readonly lights = new ChordLights();
  readonly tapeParts: readonly Element[];

  constructor() {
    Object.assign(this.background.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    // The tape reaches past its box, as far as the piece goes: the fade at its ends cuts it to the view.
    Object.assign(this.tapeSvg.style, { display: 'block', width: '100%', height: '100%', overflow: 'visible', willChange: 'transform' });
    this.tapeSvg.append(this.strip);
    this.tapeParts = [this.tapeSvg, this.lights.layer];
  }

  sized(): void {
    // (SVG is drawn at the size it is shown: nothing to do.)
  }

  showBackground(shapes: readonly Shape[]): void {
    this.background.replaceChildren(...shapes.map(toSvg));
  }

  showTape(drawing: TapeDrawing | null, sounds: { readonly chords: readonly StaffChord[]; readonly graces: readonly StaffGrace[] }): void {
    this.strip.replaceChildren();
    this.lights.drawn([], [], [], []);
    // (Nothing of the last piece is kept to be shown: it would stay, and be shown again.)
    this.nearView.measure([]);
    if (!drawing) return;
    const made = (shapes: readonly Shape[]) => shapes.map((shape) => ({ shape, element: toSvg(shape) }));
    const lines = made(drawing.lines);
    const rests = made(drawing.rests.children);
    const chords = made(drawing.chords);
    const graces = made(drawing.graces);
    const beams = made(drawing.beams.children);
    const restLayer = svg('g', { color: drawing.rests.color });
    restLayer.append(...rests.map((each) => each.element));
    const beamLayer = svg('g', { color: drawing.beams.color });
    beamLayer.append(...beams.map((each) => each.element));

    const elements = (list: readonly { element: SVGElement }[]) => list.map((each) => each.element);
    this.strip.append(this.overlay, this.loopLayer, ...elements(lines), restLayer, ...elements(chords), ...elements(graces), beamLayer);
    this.lights.drawn(sounds.chords, elements(chords), sounds.graces, elements(graces));
    // The shades behind the music are few, and always shown; the layers are shown shape by shape.
    this.nearView.measure([...lines, ...rests, ...chords, ...graces, ...beams].map(({ shape, element }) => ({ element, extent: extentOf(shape) })));
  }

  showOverlay(shapes: readonly Shape[]): void {
    this.overlay.replaceChildren(...shapes.map(toSvg));
  }

  showLoop(shapes: readonly Shape[]): void {
    this.loopLayer.replaceChildren(...shapes.map(toSvg));
  }

  light(lit: Lit): void {
    this.lights.light(lit);
  }

  move(offset: number, inSight: number): void {
    // Hidden before the browser lays them out: what is far from the view.
    this.nearView.view(-offset, inSight);
    this.tapeSvg.style.transform = this.lights.layer.style.transform = `translateX(${offset}px)`;
  }
}

/** The staff drawn in SVG. */
export class SvgStaff extends TapeStaff {
  constructor(container: HTMLElement) {
    super(container, new SvgSurface());
  }
}
