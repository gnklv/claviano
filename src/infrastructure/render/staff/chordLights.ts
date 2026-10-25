import type { StaffChord, StaffGrace } from '../../../domain/notation/engraving';
import type { Hand } from '../../../domain/note';
import { SAME_MOMENT } from '../../../domain/moment';
import { firstAtOrAfter } from '../../../domain/search';
import { COLORS } from './shapes';
import { svg } from './svg';

/*
 * The chords sounding where the music is, lit in their hand's colour, like the keys on the keyboard.
 * Found along the page, so a repeated bar lights up again on every pass.
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
  private longestChord = 0;
  /** Chords lit now, in the order of the page. */
  private lit: number[] = [];
  /** The chords sounding at this frame, in the order of the page. (Two lists kept and swapped: nothing is made anew at every frame.) */
  private sounding: number[] = [];
  private readonly litGraces = new Set<number>();
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
    this.longestChord = chords.reduce((max, chord) => Math.max(max, chord.beats), 0);
    this.lit.length = 0;
    this.litGraces.clear();
    this.chordCopies = [];
    this.graceCopies = [];
    this.layer.replaceChildren();
  }

  /** Lights what sounds at `beat` along the page; chords of muted hands are left in ink. */
  light(beat: number, isHandEnabled: (hand: Hand) => boolean): void {
    const { chords, sounding, lit } = this;
    sounding.length = 0;
    for (let i = firstAtOrAfter(chords, beat - this.longestChord, beatOf); i < chords.length; i++) {
      const chord = chords[i]!;
      if (chord.beat > beat + SAME_MOMENT) break;
      if (chord.beat + chord.beats > beat + SAME_MOMENT && isHandEnabled(chord.hand)) sounding.push(i);
    }
    // (A few chords at a time: looked through, not looked up.)
    for (const index of lit) if (!sounding.includes(index)) this.chordCopies[index]!.remove();
    for (const index of sounding) {
      if (lit.includes(index)) continue;
      this.layer.append((this.chordCopies[index] ??= litCopy(this.chordShapes[index]!, COLORS.hand[chords[index]!.hand])));
    }
    this.sounding = lit;
    this.lit = sounding;

    // Grace notes: few, and each sounds for a moment.
    for (let index = 0; index < this.graces.length; index++) {
      const grace = this.graces[index]!;
      const on = grace.beat <= beat + SAME_MOMENT && grace.beat + grace.beats > beat + SAME_MOMENT && isHandEnabled(grace.hand);
      if (on === this.litGraces.has(index)) continue;
      if (on) {
        this.layer.append((this.graceCopies[index] ??= litCopy(this.graceShapes[index]!, COLORS.hand[grace.hand])));
        this.litGraces.add(index);
      } else {
        this.graceCopies[index]!.remove();
        this.litGraces.delete(index);
      }
    }
  }
}

/** A copy of what is drawn, in a hand's colour, to lay over it. */
function litCopy(drawn: SVGElement, color: string): SVGElement {
  const copy = drawn.cloneNode(true) as SVGElement;
  copy.style.display = '';
  copy.style.color = color;
  return copy;
}

const beatOf = (chord: StaffChord): number => chord.beat;
