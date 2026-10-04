import {
  barAtBeat,
  clefAt,
  writtenPositionAt,
  writtenBeatAt,
  keySignatureAt,
  timeSignatureAt,
  type Score,
  type TimeRange,
} from '../../domain/score';
import { firstAtOrAfter } from '../../domain/search';
import type { Hand } from '../../domain/note';
import { approach } from './keyboardCamera';
import {
  layoutNotation,
  type Beam,
  type StaffChord,
  type StaffGrace,
  type StaffMark,
  type StaffOctaveShift,
  type StaffRest,
  type StaffSlur,
  type Tie,
  type Tuplet,
} from './notationLayout';
import { barPosition, tapeBars, type Clef } from './staffLayout';
import { drawBeam, drawChord, drawMark, drawRest, drawSlur, drawTie, drawTuplet } from './staff/chords';
import type { StaffContext } from './staff/context';
import { drawDynamics } from './staff/dynamics';
import { StaffGeometry } from './staff/geometry';
import { drawGrace, graceWidth } from './staff/graces';
import { drawGutter, type GutterContent } from './staff/gutter';
import { StaffInk } from './staff/ink';
import {
  drawBarLines,
  drawBarNumbers,
  drawClefChanges,
  drawNavigation,
  drawOctaveShift,
  drawSignatureChanges,
  drawTempoMarks,
  type OctaveBracket,
} from './staff/markings';
import { drawPedal } from './staff/pedal';
import { COLORS, svg } from './staff/svg';

/*
 * The staff's parts live in ./staff: where things go (geometry), where the notes reach (ink), and
 * the drawing of chords, markings, dynamics, pedals and the left column. This class holds the
 * page together: the layers, the tape's movement, and the chords lighting up as they sound.
 */

/** Share of the tape's width over which each edge fades out. */
const FADE = 0.12;

/*
 * When the tape leaps (back on a repeat, over the room of a key or time change, after a seek or a
 * drag), it glides there rather than jumps: this is the glide's time constant in seconds (about
 * three of them to arrive). Ordinary playback is followed exactly, however fast (see render).
 */
const TAPE_GLIDE_SECONDS = 0.1;
/**
 * After the tape is dragged by hand it stays put for this long (of playing time) before it goes
 * back to the music, as the falling notes' keyboard does. A position change bigger than
 * SEEK_THRESHOLD_SECONDS between frames is a seek, which brings it back at once.
 */
const MANUAL_HOLD_SECONDS = 3;
const SEEK_THRESHOLD_SECONDS = 0.5;

/** A click within this many staff spaces of a notehead's centre means that note. */
const NOTE_SNAP = 1.2;

/**
 * A grand staff shown as a tape that scrolls under a fixed cursor.
 *
 * Three layers: staff lines and clefs that never move, the tape with bar lines and notes that
 * slides left, and the cursor on top. The whole tape is built once per score; during playback
 * only its transform changes, which is cheap for the browser.
 */
export class SvgStaff {
  private readonly background: SVGSVGElement;
  private readonly tape: HTMLDivElement;
  private readonly tapeSvg: SVGSVGElement;
  private readonly strip: SVGGElement;
  private readonly cursor: HTMLDivElement;

  private readonly geometry = new StaffGeometry();
  private readonly ink = new StaffInk(this.geometry);

  private score: Score | null = null;
  private loop: TimeRange | null = null;
  private lastOffset = Number.NaN;
  /** Where the tape is drawn (it trails the target while gliding back on a repeat). */
  private shownOffset = Number.NaN;
  /** How far the tape trails the music while gliding to it (pixels); 0 when following exactly. */
  private lag = 0;
  /** The printed bar the music was in at the last frame, to tell playing on from a leap. */
  private lastBar = 0;
  private lastFrameAt = 0;
  /** Beat under the cursor; the left column shows the signatures in force there. */
  private currentBeat = 0;
  /** Which signatures the left column shows now; it is redrawn when they change. */
  private shownSignatures = '';
  /** The piece's drawn groups; their chord indices point into the ink's chords. */
  private beams: Beam[] = [];
  private tuplets: Tuplet[] = [];
  private rests: StaffRest[] = [];
  private ties: Tie[] = [];
  private marks: StaffMark[] = [];
  private slurs: StaffSlur[] = [];
  private octaveShifts: StaffOctaveShift[] = [];
  private graces: StaffGrace[] = [];
  private chordElements: SVGGElement[] = [];
  private graceElements: SVGGElement[] = [];
  /** Grace notes currently highlighted. */
  private readonly litGraces = new Set<number>();
  private longestChord = 0;
  /** Chords currently highlighted in their hand's color. */
  private readonly lit = new Set<number>();
  /** Hand marks for notes written on the other hand's staff ("L.H." / "л. р."), in the UI language. */
  private handLabels: Record<Hand, string> = { right: 'R.H.', left: 'L.H.' };
  /** Behind the music on the tape: the printed bar under the pointer, and bars being selected by dragging. */
  private readonly overlay: SVGGElement = svg('g');
  private hoverBar: number | null = null;
  /** The tape dragged by hand (see dragBy), or null while it follows the music. */
  private manual: { offset: number; idle: number } | null = null;
  private lastPosition = 0;
  private lastCursorLeft = Number.NaN;
  private selection: { from: number; to: number } | null = null;

  constructor(private readonly container: HTMLElement) {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = COLORS.background;

    this.background = svg('svg');
    Object.assign(this.background.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });

    this.tape = document.createElement('div');
    const fade = `linear-gradient(to right, transparent 0, #000 ${FADE * 100}%, #000 ${(1 - FADE) * 100}%, transparent 100%)`;
    Object.assign(this.tape.style, { position: 'absolute', top: '0', bottom: '0', right: '0' });
    this.tape.style.maskImage = fade;
    this.tape.style.setProperty('-webkit-mask-image', fade);
    this.tapeSvg = svg('svg');
    Object.assign(this.tapeSvg.style, { display: 'block', width: '100%', height: '100%' });
    this.strip = svg('g');
    this.tapeSvg.append(this.strip);
    this.tape.append(this.tapeSvg);

    this.cursor = document.createElement('div');
    Object.assign(this.cursor.style, { position: 'absolute', width: '2px', background: COLORS.cursor, borderRadius: '1px' });

    container.append(this.background, this.tape, this.cursor);
    this.resize();
  }

  setScore(score: Score | null): void {
    this.score = score;
    const layout = score
      ? layoutNotation(score)
      : { chords: [], octaveShifts: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [], graces: [] };
    this.ink.setChords([...layout.chords], layout.marks);
    this.beams = [...layout.beams];
    this.tuplets = [...layout.tuplets];
    this.rests = [...layout.rests];
    this.ties = [...layout.ties];
    this.marks = [...layout.marks];
    this.slurs = [...layout.slurs];
    this.octaveShifts = [...layout.octaveShifts];
    this.graces = [...layout.graces];
    this.longestChord = layout.chords.reduce((max, chord) => Math.max(max, chord.beats), 0);
    this.geometry.setScore(score, graceRoom(score, layout.graces, layout.chords));
    this.currentBeat = 0;
    this.drawBackground();
    this.drawStrip();
  }

  setHandLabels(labels: Record<Hand, string>): void {
    this.handLabels = labels;
    this.drawStrip();
  }

  setLoop(loop: TimeRange | null): void {
    this.loop = loop;
    this.drawStrip();
  }

  /**
   * The place on the page under the pointer: the printed bar, and the beat there. A click just
   * beside a notehead means that note, so it snaps to the note's beat (otherwise playback would
   * start a moment after the note is struck). Null outside the tape.
   */
  pageAt(clientX: number): { bar: number; beat: number } | null {
    const score = this.score;
    if (!score || score.notes.length === 0) return null;
    const { geometry, ink } = this;
    const offset = Number.isNaN(this.lastOffset) ? 0 : this.lastOffset;
    const px = clientX - this.tapeSvg.getBoundingClientRect().left - offset;
    const place = geometry.pageAt(px);
    if (!place) return null;
    const snap = NOTE_SNAP * geometry.space;
    let nearest: StaffChord | null = null;
    for (const index of ink.near(px - snap, px + snap)) {
      const chord = ink.chords[index];
      const distance = Math.abs(geometry.px(chord.x) - px);
      if (distance <= snap && (!nearest || distance < Math.abs(geometry.px(nearest.x) - px))) nearest = chord;
    }
    return nearest && barAtBeat(score, nearest.beat) === place.bar ? { bar: place.bar, beat: nearest.beat } : place;
  }

  /** Lightly shades the printed bar under the pointer (null: none). */
  setHover(bar: number | null): void {
    if (bar === this.hoverBar) return;
    this.hoverBar = bar;
    this.drawOverlay();
  }

  /** Shades printed bars `from..to` in the loop colour while they are being dragged over (null: none). */
  setSelection(selection: { from: number; to: number } | null): void {
    this.selection = selection;
    this.drawOverlay();
  }

  /** Call when the container's size changes. */
  resize(): void {
    this.geometry.resize(this.container.clientWidth, this.container.clientHeight);
    this.drawBackground();
    this.drawStrip();
  }

  /**
   * Called every frame; touches the DOM only when something changes: the tape moves,
   * or a chord starts or stops sounding. Chords of muted hands are not highlighted.
   */
  render(position: number, isHandEnabled: (hand: Hand) => boolean = () => true, playing = false): void {
    const { geometry } = this;
    if (this.score) {
      this.currentBeat = writtenBeatAt(this.score, position);
      if (this.signaturesKey() !== this.shownSignatures) this.drawBackground();
      this.highlight(this.currentBeat, isHandEnabled);
    }
    const x = this.score ? geometry.px(barPosition(this.score, position)) : 0;
    const target = geometry.cursorX() - x;

    const now = performance.now();
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.lastFrameAt = now;
    if (Number.isNaN(this.shownOffset)) this.shownOffset = target;

    // Dragged by hand: the tape stays where it was put; after a while of playing it goes back to the
    // music. A seek (a click, the arrows) goes back at once.
    const seeked = Math.abs(position - this.lastPosition) > SEEK_THRESHOLD_SECONDS;
    this.lastPosition = position;
    const wasManual = this.manual !== null;
    if (this.manual && (seeked || (playing && (this.manual.idle += dt) >= MANUAL_HOLD_SECONDS))) this.manual = null;

    // Where the music went on the page since the last frame: to the next printed bar is playing on;
    // anything else (a repeat, a D.S., a seek) is a leap, and so is stepping over the room kept at
    // a bar line for a key, time or repeat sign.
    const bar = this.score ? writtenPositionAt(this.score, position).bar : 0;
    const previous = this.lastBar;
    this.lastBar = bar;
    const nextBar = bar === previous + 1;
    const leap =
      seeked ||
      (wasManual && !this.manual) ||
      (bar !== previous && !nextBar) ||
      (nextBar && ((geometry.lead[bar] ?? 0) > 0 || (geometry.tail[previous] ?? 0) > 0));

    if (this.manual) {
      this.shownOffset = this.manual.offset;
      this.lag = 0;
    } else {
      // Follow the music exactly; but on a leap, glide to it. The glide shrinks the distance to the
      // music rather than chasing it: the music keeps moving, and a glide towards a moving target
      // would never quite arrive.
      if (leap) this.lag = this.shownOffset - target;
      this.lag = approach(this.lag, 0, dt, TAPE_GLIDE_SECONDS);
      this.shownOffset = target + this.lag;
    }

    // The cursor marks the music on the tape: it stands still, unless the tape is moved away from it.
    const cursorX = this.manual ? x + this.shownOffset : geometry.cursorX();
    const cursorLeft = Math.round((geometry.gutterWidth() + cursorX - 1) * 10) / 10;
    if (cursorLeft !== this.lastCursorLeft) {
      this.lastCursorLeft = cursorLeft;
      this.cursor.style.left = `${cursorLeft}px`;
      this.cursor.style.visibility = cursorX < 0 || cursorX > geometry.width - geometry.gutterWidth() ? 'hidden' : 'visible';
    }

    const offset = Math.round(this.shownOffset * 10) / 10;
    if (offset === this.lastOffset) return;
    this.lastOffset = offset;
    this.strip.setAttribute('transform', `translate(${offset} 0)`);
  }

  /**
   * Moves the tape by `dx` pixels by hand (to the right: back in the music). The music plays on;
   * after a while of playing the tape goes back to it, like a keyboard scrolled by hand.
   */
  dragBy(dx: number): void {
    const score = this.score;
    if (!score || score.notes.length === 0) return;
    const { geometry } = this;
    const current = this.manual?.offset ?? this.shownOffset;
    // Keep some of the music in sight: the cursor's place stays between the first and the last bar.
    const lowest = geometry.cursorX() - geometry.px(tapeBars(score).end);
    this.manual = { offset: Math.min(geometry.cursorX(), Math.max(lowest, current + dx)), idle: 0 };
  }

  /** Back to following the music (after a jump): the tape glides to it. */
  followMusic(): void {
    this.manual = null;
  }

  /** What the left column shows under the cursor: the clefs, and the key and time signatures. */
  private gutterContent(): GutterContent {
    const score = this.score;
    if (!score) return { clefs: ['treble', 'bass'], signatures: null };
    const clefs: [Clef, Clef] = [clefAt(score, 1, this.currentBeat), clefAt(score, 2, this.currentBeat)];
    if (score.notes.length === 0) return { clefs, signatures: null };
    return { clefs, signatures: { key: keySignatureAt(score, this.currentBeat), time: timeSignatureAt(score, this.currentBeat) } };
  }

  private signaturesKey(): string {
    const { clefs, signatures } = this.gutterContent();
    const key = clefs.join('/');
    return signatures ? `${key} ${signatures.key.fifths} ${signatures.time.numerator}/${signatures.time.denominator}` : key;
  }

  // --- Drawing ---

  private drawBackground(): void {
    const { geometry } = this;
    const { space } = geometry;
    const gutter = geometry.gutterWidth();
    this.background.replaceChildren(...drawGutter(geometry, this.gutterContent()));
    this.shownSignatures = this.signaturesKey();

    this.tape.style.left = `${gutter}px`;
    // Its left is set by render(): it moves with the tape when the tape is dragged away.
    Object.assign(this.cursor.style, {
      left: `${gutter + geometry.cursorX() - 1}px`,
      top: `${geometry.trebleTop() - 2 * space}px`,
      height: `${(geometry.systemBottom() - geometry.trebleTop()) + 4 * space}px`,
    });
    this.lastOffset = Number.NaN;
    this.lastCursorLeft = Number.NaN;
  }

  /** The hovered bar (faint) and the bars being selected (in the loop colour), behind the music. */
  private drawOverlay(): void {
    this.overlay.replaceChildren();
    const score = this.score;
    if (!score || score.notes.length === 0) return;
    const { geometry } = this;
    const { space } = geometry;
    const tape = tapeBars(score);
    const top = geometry.trebleTop() - 3 * space;
    const height = geometry.systemBottom() - geometry.trebleTop() + 6 * space;
    const shade = (from: number, to: number, fill: string, opacity: number) => {
      const x = geometry.barLineX(from);
      const end = geometry.barLineX(to + 1);
      const rect = svg('rect', { x, y: top, width: end - x, height, fill });
      rect.style.opacity = String(opacity);
      this.overlay.append(rect);
    };
    if (this.selection) {
      const { from, to } = this.selection;
      shade(Math.min(from, to), Math.max(from, to), COLORS.loop, 1);
    } else if (this.hoverBar !== null && this.hoverBar < tape.starts.length) {
      shade(this.hoverBar, this.hoverBar, COLORS.loop, 0.5);
    }
  }

  private drawStrip(): void {
    this.ink.reset();
    this.strip.replaceChildren();
    this.lit.clear();
    this.litGraces.clear();
    this.chordElements = [];
    this.graceElements = [];
    const score = this.score;
    if (!score || score.notes.length === 0) return;

    const { geometry, ink } = this;
    const { space } = geometry;
    const context: StaffContext = { score, geometry, ink };
    const top = geometry.trebleTop();
    const bottom = geometry.systemBottom();

    this.strip.append(this.overlay);
    this.drawOverlay();

    if (this.loop) {
      const start = geometry.edgeX(barPosition(score, this.loop.start));
      // The end of the loop's last bar: the next bar played may be printed earlier (a repeat).
      const end = geometry.edgeX(barPosition(score, Math.max(this.loop.start, this.loop.end - 1e-6)));
      this.strip.append(
        svg('rect', { x: start, y: top - 3 * space, width: Math.max(0, end - start), height: bottom - top + 6 * space, fill: COLORS.loop }),
      );
    }

    const barLines = drawBarLines(context);
    this.strip.append(...barLines.lines, ...drawSignatureChanges(context), ...barLines.final, ...drawClefChanges(context));

    // Beams first: they decide how long the stems of their chords are.
    const beamLayer = svg('g');
    beamLayer.style.color = COLORS.note;
    for (const beam of this.beams) beamLayer.append(...drawBeam(context, beam));
    for (const tuplet of this.tuplets) {
      if (tuplet.showNumber || tuplet.bracket) beamLayer.append(...drawTuplet(context, tuplet));
    }

    this.chordElements = ink.chords.map((_, index) => drawChord(context, index, this.handLabels));
    // A tie belongs to the chord it starts from, so it lights up with it; so do the chord's marks.
    for (const tie of this.ties) this.chordElements[tie.from].append(drawTie(context, tie));
    for (const mark of this.marks) this.chordElements[mark.chord].append(drawMark(context, mark));
    // A slur spans a phrase, so it stays in the ink colour with the beams.
    for (const phrase of this.slurs) beamLayer.append(drawSlur(context, phrase));

    // Grace notes before what goes around the notes: bar numbers, brackets and dynamics clear them too.
    this.graceElements = this.graces.map((grace) => drawGrace(context, grace));

    const restLayer = svg('g');
    restLayer.style.color = COLORS.note;
    for (const rest of this.rests) restLayer.append(...drawRest(context, rest));
    // Bar numbers clear the notes, and volta brackets clear the bar numbers.
    const barNumbers = drawBarNumbers(context);
    restLayer.append(...barNumbers.shapes, ...drawNavigation(context, barNumbers.y));
    // Octave brackets first: the tempo marks go over the 8va ones, the pedal under the 8vb ones.
    const brackets: OctaveBracket[] = [];
    for (const shift of this.octaveShifts) {
      const drawn = drawOctaveShift(context, shift);
      restLayer.append(...drawn.shapes);
      brackets.push(drawn.bracket);
    }
    // Dynamics before the pedal: those pushed under the lower staff, the pedal goes under.
    const dynamics = drawDynamics(context);
    restLayer.append(...drawPedal(context, { brackets, dynamics: dynamics.below }), ...dynamics.shapes);
    restLayer.append(...drawTempoMarks(context, brackets));

    this.strip.append(restLayer, ...this.chordElements, ...this.graceElements, beamLayer);
    this.lastOffset = Number.NaN;
  }

  /**
   * Colors the chords sounding at `beat` (along the page) in their hand's color, like the keys on
   * the keyboard. Working along the page means a repeated bar lights up again on every pass.
   */
  private highlight(beat: number, isHandEnabled: (hand: Hand) => boolean): void {
    const { chords } = this.ink;
    const active = new Set<number>();
    for (let i = firstAtOrAfter(chords, beat - this.longestChord, (chord) => chord.beat); i < chords.length; i++) {
      const chord = chords[i];
      if (chord.beat > beat + 1e-9) break;
      if (chord.beat + chord.beats > beat + 1e-9 && isHandEnabled(chord.hand)) active.add(i);
    }
    for (const index of this.lit) {
      if (active.has(index)) continue;
      this.chordElements[index].style.color = COLORS.note;
      this.lit.delete(index);
    }
    for (const index of active) {
      if (this.lit.has(index)) continue;
      this.chordElements[index].style.color = COLORS.hand[chords[index].hand];
      this.lit.add(index);
    }

    // Grace notes: few, and each sounds for a moment.
    this.graces.forEach((grace, index) => {
      const sounding = grace.beat <= beat + 1e-9 && grace.beat + grace.beats > beat + 1e-9 && isHandEnabled(grace.hand);
      if (sounding === this.litGraces.has(index)) return;
      this.graceElements[index].style.color = sounding ? COLORS.hand[grace.hand] : COLORS.note;
      if (sounding) this.litGraces.add(index);
      else this.litGraces.delete(index);
    });
  }
}

/** The room grace notes need at the start of printed bars (before the first note) and at their end (after the last). */
function graceRoom(
  score: Score | null,
  graces: readonly StaffGrace[],
  chords: readonly StaffChord[],
): { lead: Map<number, number>; tail: Map<number, number> } {
  const lead = new Map<number, number>();
  const tail = new Map<number, number>();
  if (!score) return { lead, tail };
  for (const grace of graces) {
    const principal = grace.principal === null ? null : chords[grace.principal];
    const width = graceWidth(grace, principal?.notes.some((note) => note.accidental) ?? false);
    if (!principal) tail.set(grace.bar, Math.max(tail.get(grace.bar) ?? 0, width));
    else if (Math.abs(principal.beat - score.writtenBarBeats[principal.bar]) < 1e-6) {
      lead.set(principal.bar, Math.max(lead.get(principal.bar) ?? 0, width));
    }
  }
  return { lead, tail };
}
