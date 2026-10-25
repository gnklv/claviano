import type { StaffChord, StaffGrace } from '../../../domain/notation/engraving';
import { COLORS } from './shapes';
import type { Lit } from './sounding';
import { svg } from './svg';

/*
 * The chords sounding where the music is, lit on an SVG staff (see Sounding for which).
 *
 * A lit chord is a copy of it, laid over it in a layer of its own that moves with the tape: the tape
 * itself is not touched while the music plays. (A browser that draws the tape in tiles, as Safari
 * does, would draw a whole tile of it again at every note that starts or stops, and the tape would
 * stumble.)
 */

export class ChordLights {
  /** The layer of lit copies, laid over the tape and moved with it. */
  readonly layer: SVGSVGElement = svg('svg');
  private chords: readonly StaffChord[] = [];
  private chordShapes: readonly SVGElement[] = [];
  private graces: readonly StaffGrace[] = [];
  private graceShapes: readonly SVGElement[] = [];
  private lit: Lit = { chords: [], graces: [] };
  /** Lit copies made so far, kept to be laid over again: a chord is lit again on every pass, a grace note too. */
  private chordCopies: SVGElement[] = [];
  private graceCopies: SVGElement[] = [];

  constructor() {
    Object.assign(this.layer.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible', willChange: 'transform' });
  }

  /** What is drawn now: the chords and grace notes, and the shape of each (nothing lit yet). */
  drawn(chords: readonly StaffChord[], chordShapes: readonly SVGElement[], graces: readonly StaffGrace[], graceShapes: readonly SVGElement[]): void {
    this.chords = chords;
    this.chordShapes = chordShapes;
    this.graces = graces;
    this.graceShapes = graceShapes;
    this.lit = { chords: [], graces: [] };
    this.chordCopies = [];
    this.graceCopies = [];
    this.layer.replaceChildren();
  }

  /** Lights what sounds now, and puts out what no longer does. */
  light(now: Lit): void {
    if (now === this.lit) return;
    // (A few chords at a time: looked through, not looked up.)
    for (const index of this.lit.chords) if (!now.chords.includes(index)) this.chordCopies[index]!.remove();
    for (const index of now.chords) {
      if (this.lit.chords.includes(index)) continue;
      this.layer.append((this.chordCopies[index] ??= litCopy(this.chordShapes[index]!, COLORS.hand[this.chords[index]!.hand])));
    }
    for (const index of this.lit.graces) if (!now.graces.includes(index)) this.graceCopies[index]!.remove();
    for (const index of now.graces) {
      if (this.lit.graces.includes(index)) continue;
      this.layer.append((this.graceCopies[index] ??= litCopy(this.graceShapes[index]!, COLORS.hand[this.graces[index]!.hand])));
    }
    this.lit = now;
  }
}

/** A copy of what is drawn, in a hand's colour, to lay over it. */
function litCopy(drawn: SVGElement, color: string): SVGElement {
  const copy = drawn.cloneNode(true) as SVGElement;
  copy.style.display = '';
  copy.style.color = color;
  return copy;
}
