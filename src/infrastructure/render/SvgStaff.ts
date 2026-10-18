import type { StaffView } from '../../application/ports/StaffView';
import {
  barAtBeat,
  clefSignAt,
  writtenBarAt,
  writtenBeatAt,
  keySignatureAt,
  timeSignatureAt,
  type Score,
  type TimeRange,
} from '../../domain/score';
import { lastAtOrBefore } from '../../domain/search';
import type { Hand } from '../../domain/note';
import { engrave, reachOf, type NotationLayout, type StaffChord } from '../../domain/notation/engraving';
import type { ClefSign } from '../../domain/notation/written';
import { barPosition, tapeBars } from './staffLayout';
import { drawBeam, drawChord, drawFingering, drawMark, drawRest, drawSlur, drawTie, drawTuplet } from './staff/chords';
import { columnsOf, graceRoom } from './staff/columns';
import type { StaffContext } from './staff/context';
import { drawDynamics } from './staff/dynamics';
import { StaffGeometry } from './staff/geometry';
import { drawGrace } from './staff/graces';
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
import { drawArpeggio, drawOrnament, drawTremolo } from './staff/ornaments';
import { drawPedal } from './staff/pedal';
import { ChordLights } from './staff/chordLights';
import { barsShade, loopShade, noteShade } from './staff/shades';
import { COLORS, svg, tenth } from './staff/svg';
import { TapeMotion } from './staff/tapeMotion';
import { TapeStretch } from './staff/tapeStretch';
import { TapeWindow } from './staff/tapeWindow';
import { SAME_MOMENT, sameMoment } from '../../domain/moment';
import type { NoteOnPage } from '../../domain/fingering/own';

/*
 * The staff's parts live in ./staff: where things go (geometry), where the notes reach (ink), the
 * drawing of chords, markings, dynamics, pedals and the left column, where the tape stands
 * (tapeMotion), its stretch through sizes on the move (tapeStretch), the chords lit as they sound
 * (chordLights) and the stretch of tape shown (tapeWindow). This class holds the page together: the
 * layers, and the tape drawn on them.
 */

/** Share of the tape's width over which each edge fades out. */
const FADE = 0.12;

/** The tape fades out at both its ends. */
const TAPE_FADE = `linear-gradient(to right, transparent 0, #000 ${FADE * 100}%, #000 ${(1 - FADE) * 100}%, transparent 100%)`;
/**
 * Drawing the piece anew took longer than this, in milliseconds: longer than a frame lasts on a
 * screen that shows 120 of them a second. Done at a step of a size on the move, the step is seen.
 */
const FRAME_MS = 8;

/** A click within this many staff spaces of a notehead's centre means that note. */
const NOTE_SNAP = 1.2;

/**
 * A grand staff shown as a tape that scrolls under a fixed cursor.
 *
 * Three layers: staff lines and clefs that never move, the tape with bar lines and notes that
 * slides left, and the cursor on top. The whole tape is built once per score; during playback
 * it is only moved, as a layer of its own that the browser slides without drawing it again, and
 * only the stretch of it near the view is shown (see TapeWindow).
 */
export class SvgStaff implements StaffView {
  private readonly background: SVGSVGElement;
  private readonly tape: HTMLDivElement;
  private readonly tapeSvg: SVGSVGElement;
  private readonly strip: SVGGElement;
  private readonly cursor: HTMLDivElement;

  private readonly geometry = new StaffGeometry();
  private readonly ink = new StaffInk(this.geometry);
  private readonly nearView = new TapeWindow();
  private readonly motion = new TapeMotion();
  private readonly lights = new ChordLights();
  private readonly stretch: TapeStretch;

  private score: Score | null = null;
  private loop: TimeRange | null = null;
  /** The tape's offset as last drawn (NaN: to be drawn afresh). */
  private lastOffset = Number.NaN;
  private lastFrameAt = 0;
  /** Beat under the cursor; the left column shows the signatures in force there. */
  private currentBeat = 0;
  /** Where along the page (beats) a clef, key or time changes: the left column is drawn anew past one. */
  private gutterChanges: number[] = [];
  /** The last of them the left column was drawn after (−1: none, the piece's start). */
  private shownGutter = -1;
  /** The piece as laid out to be drawn; its chord indices point into the ink's chords. */
  private layout: NotationLayout = NO_LAYOUT;
  /** Hand marks for notes written on the other hand's staff ("L.H." / "л. р."), in the UI language. */
  private handLabels: Record<Hand, string> = { right: 'R.H.', left: 'L.H.' };
  /** Behind the music on the tape: the printed bar under the pointer, and bars being selected by dragging. */
  private readonly overlay: SVGGElement = svg('g');
  /** The loop's shade, behind the music too: redrawn alone when the loop changes. */
  private readonly loopLayer: SVGGElement = svg('g');
  private hoverBar: number | null = null;
  /** The note being fingered, marked behind its head. */
  private picked: NoteOnPage | null = null;
  /** Whether the last drawing anew took longer than a frame (see resize). */
  private costly = false;
  private lastCursorLeft = Number.NaN;
  private selection: { from: number; to: number } | null = null;

  constructor(private readonly container: HTMLElement) {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = COLORS.background;

    this.background = svg('svg');
    Object.assign(this.background.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });

    this.tape = document.createElement('div');
    Object.assign(this.tape.style, { position: 'absolute', top: '0', bottom: '0', right: '0' });
    this.tape.style.maskImage = TAPE_FADE;
    this.tape.style.setProperty('-webkit-mask-image', TAPE_FADE);
    this.tapeSvg = svg('svg');
    // The tape reaches past its box, as far as the piece goes: the fade at its ends cuts it to the view.
    Object.assign(this.tapeSvg.style, { display: 'block', width: '100%', height: '100%', overflow: 'visible', willChange: 'transform' });
    this.strip = svg('g');
    this.tapeSvg.append(this.strip);
    this.tape.append(this.tapeSvg, this.lights.layer);

    this.cursor = document.createElement('div');
    Object.assign(this.cursor.style, { position: 'absolute', width: '2px', background: COLORS.cursor, borderRadius: '1px' });

    container.append(this.background, this.tape, this.cursor);
    this.stretch = new TapeStretch(this.geometry, { background: this.background, tape: this.tape, cursor: this.cursor }, () => this.rested());
    this.geometry.resize(container.clientWidth, container.clientHeight);
    this.redraw();
  }

  setScore(score: Score | null): void {
    this.score = score;
    const layout = score ? engrave(score) : NO_LAYOUT;
    this.layout = layout;
    this.ink.setChords([...layout.chords], layout.marks);
    this.geometry.setScore(score, {
      graceRoom: graceRoom(score, layout.graces, layout.chords),
      columns: score ? columnsOf(score, layout) : [],
      reach: score
        ? reachOf(layout, {
            pedal: score.pedal.length > 0,
            words: score.notation.words.length > 0 || score.notation.tempoMarks.length > 0,
            dynamics: score.notation.dynamics.length > 0,
          })
        : undefined,
    });
    this.gutterChanges = score ? [...score.notation.clefs, ...score.notation.keySignatures, ...score.notation.timeSignatures].map((change) => change.beat).sort((a, b) => a - b) : [];
    this.currentBeat = 0;
    this.redraw();
  }

  setHandLabels(labels: Record<Hand, string>): void {
    this.handLabels = labels;
    this.drawStrip();
  }

  setLoop(loop: TimeRange | null): void {
    this.loop = loop;
    this.drawLoop();
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
    // (The tape's box, stretched, is shown larger or smaller than what is drawn in it.)
    const px = (clientX - this.tape.getBoundingClientRect().left) / this.stretch.by - offset;
    const place = geometry.pageAt(px);
    if (!place) return null;
    const snap = NOTE_SNAP * geometry.space;
    let nearest: StaffChord | null = null;
    for (const index of ink.near(px - snap, px + snap)) {
      const chord = ink.chord(index);
      const distance = Math.abs(ink.placeOf(chord) - px);
      if (distance <= snap && (!nearest || distance < Math.abs(ink.placeOf(nearest) - px))) nearest = chord;
    }
    return nearest && barAtBeat(score, nearest.beat) === place.bar ? { bar: place.bar, beat: nearest.beat } : place;
  }

  /**
   * The note under the pointer: of the chords beside it, the head nearest, if one is within reach
   * (a staff space up or down, as far across as a click on a note snaps).
   */
  noteAt(clientX: number, clientY: number): NoteOnPage | null {
    const score = this.score;
    if (!score || score.notes.length === 0) return null;
    const { geometry, ink } = this;
    const box = this.tape.getBoundingClientRect();
    const offset = Number.isNaN(this.lastOffset) ? 0 : this.lastOffset;
    const px = (clientX - box.left) / this.stretch.by - offset;
    const py = (clientY - box.top) / this.stretch.by;
    const snap = NOTE_SNAP * geometry.space;
    let nearest: { note: NoteOnPage; distance: number } | null = null;
    for (const index of ink.near(px - snap, px + snap)) {
      const chord = ink.chord(index);
      const top = geometry.staffTop(chord.staff);
      for (const note of chord.notes) {
        if (note.sounding === undefined || note.headless) continue;
        const across = Math.abs(ink.placeOf(chord) - px);
        const down = Math.abs(top + (note.step * geometry.space) / 2 - py);
        if (across > snap || down > geometry.space) continue;
        const distance = Math.hypot(across, down);
        if (!nearest || distance < nearest.distance) nearest = { note: { beat: chord.beat, pitch: note.sounding, hand: chord.hand }, distance };
      }
    }
    return nearest?.note ?? null;
  }

  /** Marks a note as the one being fingered, behind it (null: none). */
  setPicked(note: NoteOnPage | null): void {
    this.picked = note;
    this.drawOverlay();
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
    const { clientWidth: width, clientHeight: height } = this.container;
    if (this.stretch.on || (this.costly && (width !== this.geometry.width || height !== this.geometry.height))) {
      // Drawing the whole piece anew takes longer than a frame: stretched through the sizes on the move (see tapeStretch).
      this.stretch.to(width, height);
      this.lastOffset = Number.NaN;
      this.lastCursorLeft = Number.NaN;
      return;
    }
    // Browsers report a size when watching begins, changed or not: nothing to draw anew then.
    if (width === this.geometry.width && height === this.geometry.height) return;
    this.geometry.resize(width, height);
    this.redraw();
  }

  /** The size has come to rest, the stretch undone: drawn anew for it, exactly. */
  private rested(): void {
    this.lastOffset = Number.NaN;
    this.lastCursorLeft = Number.NaN;
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === this.geometry.width && height === this.geometry.height) return;
    this.geometry.resize(width, height);
    this.redraw();
  }

  private redraw(): void {
    const began = performance.now();
    this.drawBackground();
    this.drawStrip();
    this.costly = performance.now() - began > FRAME_MS;
  }

  /**
   * Called every frame; touches the DOM only when something changes: the tape moves,
   * or a chord starts or stops sounding. Chords of muted hands are not highlighted.
   */
  render(position: number, isHandEnabled: (hand: Hand) => boolean = () => true, playing = false): void {
    const { geometry, score } = this;
    if (score) {
      this.currentBeat = writtenBeatAt(score, position);
      if (this.gutterAt(this.currentBeat) !== this.shownGutter) this.drawBackground();
      this.lights.light(this.currentBeat, isHandEnabled);
    }
    const x = score ? geometry.px(barPosition(score, position)) : 0;
    const now = performance.now();
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.lastFrameAt = now;
    const shown = this.motion.frame({ position, target: geometry.cursorX() - x, bar: score ? writtenBarAt(score, position) : 0, overRoom: this.overRoom }, dt, playing);

    // The cursor marks the music on the tape: it stands still, unless the tape is moved away from it.
    const { shift } = this.stretch;
    const cursorX = (this.motion.held !== null ? x + shown : geometry.cursorX()) + shift;
    const cursorLeft = tenth(geometry.gutterWidth() + cursorX - 1);
    if (cursorLeft !== this.lastCursorLeft) {
      this.lastCursorLeft = cursorLeft;
      this.cursor.style.left = `${cursorLeft}px`;
      this.cursor.style.visibility = cursorX < 0 || cursorX > this.stretch.tapeInSight ? 'hidden' : 'visible';
    }

    const offset = tenth(shown + shift);
    if (offset === this.lastOffset) return;
    this.showAround(offset);
    this.lastOffset = offset;
    this.tapeSvg.style.transform = this.lights.layer.style.transform = `translateX(${offset}px)`;
  }

  /** Whether going on from printed bar `previous` to `bar` steps over the room kept at the bar line for a key, a time or a repeat sign. */
  private readonly overRoom = (previous: number, bar: number): boolean => (this.geometry.lead[bar] ?? 0) > 0 || (this.geometry.tail[previous] ?? 0) > 0;

  /**
   * Moves the tape by `dx` pixels by hand (to the right: back in the music). The music plays on;
   * after a while of playing the tape goes back to it, like a keyboard scrolled by hand.
   */
  dragBy(dx: number): number {
    const score = this.score;
    if (!score || score.notes.length === 0) return 0;
    const { geometry } = this;
    // Keep some of the music in sight: the cursor's place stays between the first and the last bar.
    return this.motion.dragBy(dx, geometry.cursorX() - geometry.px(tapeBars(score).end), geometry.cursorX());
  }

  setCursorPlace(share: number): void {
    this.geometry.cursorAt = Math.min(1, Math.max(0, share));
  }

  /** Back to following the music (after a jump): the tape glides to it. */
  followMusic(): void {
    this.motion.follow();
  }

  /** What the left column shows under the cursor: the clefs, and the key and time signatures. */
  private gutterContent(): GutterContent {
    const score = this.score;
    if (!score) return { clefs: [
          { clef: 'treble', octaves: 0 },
          { clef: 'bass', octaves: 0 },
        ], signatures: null };
    const clefs: [ClefSign, ClefSign] = [clefSignAt(score, 1, this.currentBeat), clefSignAt(score, 2, this.currentBeat)];
    if (score.notes.length === 0) return { clefs, signatures: null };
    return { clefs, signatures: { key: keySignatureAt(score, this.currentBeat), time: timeSignatureAt(score, this.currentBeat) } };
  }

  /** The last change of clef, key or time at or before `beat` (as the domain finds what is in force there). */
  private gutterAt(beat: number): number {
    return lastAtOrBefore(this.gutterChanges, beat + SAME_MOMENT, itself);
  }

  // --- Drawing ---

  private drawBackground(): void {
    const { geometry } = this;
    const { space } = geometry;
    const gutter = geometry.gutterWidth();
    this.background.replaceChildren(...drawGutter(geometry, this.gutterContent()));
    this.shownGutter = this.gutterAt(this.currentBeat);

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
    const score = this.score;
    const selection = this.selection;
    const shades: SVGElement[] = [];
    if (score && score.notes.length > 0) {
      if (selection) shades.push(barsShade(this.geometry, Math.min(selection.from, selection.to), Math.max(selection.from, selection.to), 1));
      else if (this.hoverBar !== null && this.hoverBar < tapeBars(score).starts.length) shades.push(barsShade(this.geometry, this.hoverBar, this.hoverBar, 0.5));
      const head = this.picked && this.headOf(this.picked);
      if (head) shades.push(noteShade(this.geometry, head.x, head.y));
    }
    this.overlay.replaceChildren(...shades);
  }

  /** Where the head of a note of the page is drawn, if it is. */
  private headOf(note: NoteOnPage): { x: number; y: number } | null {
    const { ink, geometry } = this;
    for (const index of ink.near(-Infinity, Infinity)) {
      const chord = ink.chord(index);
      if (chord.hand !== note.hand || !sameMoment(chord.beat, note.beat)) continue;
      const head = chord.notes.find((each) => each.sounding === note.pitch && !each.headless);
      if (head) return { x: ink.placeOf(chord), y: geometry.staffTop(chord.staff) + (head.step * geometry.space) / 2 };
    }
    return null;
  }

  /** The loop's bars, behind the music. */
  private drawLoop(): void {
    const { score, loop } = this;
    this.loopLayer.replaceChildren(...(score && score.notes.length > 0 && loop ? loopShade(this.geometry, score, loop) : []));
  }

  private drawStrip(): void {
    this.ink.reset();
    this.strip.replaceChildren();
    this.lights.drawn([], [], [], []);
    // (Nothing of the last piece is kept to be shown: it would stay, and be shown again.)
    this.nearView.measure([]);
    const score = this.score;
    if (!score || score.notes.length === 0) return;

    const { geometry, ink } = this;
    const context: StaffContext = { score, geometry, ink };

    this.strip.append(this.overlay, this.loopLayer);
    this.drawOverlay();
    this.drawLoop();

    const barLines = drawBarLines(context);
    this.strip.append(...barLines.lines, ...drawSignatureChanges(context), ...barLines.final, ...drawClefChanges(context));

    // Beams first: they decide how long the stems of their chords are.
    const beamLayer = svg('g');
    beamLayer.style.color = COLORS.note;
    for (const beam of this.layout.beams) beamLayer.append(...drawBeam(context, beam));
    for (const tuplet of this.layout.tuplets) {
      if (tuplet.showNumber || tuplet.bracket) beamLayer.append(...drawTuplet(context, tuplet));
    }

    const chordShapes = ink.chords.map((_, index) => drawChord(context, index, this.handLabels));
    // A tie belongs to the chord it starts from, so it lights up with it; so do the chord's marks.
    for (const tie of this.layout.ties) chordShapes[tie.from]?.append(drawTie(context, tie));
    for (const mark of this.layout.marks) chordShapes[mark.chord]?.append(drawMark(context, mark));
    // A slur spans a phrase, so it stays in the ink colour with the beams.
    for (const phrase of this.layout.slurs) beamLayer.append(drawSlur(context, phrase));

    // Grace notes and ornaments before what goes around the notes: bar numbers, brackets and
    // dynamics clear them too. Ornaments, tremolos and rolls belong to their chord and light up with it.
    const graceShapes = this.layout.graces.map((grace) => drawGrace(context, grace));
    for (const ornament of this.layout.ornaments) chordShapes[ornament.chord]?.append(...drawOrnament(context, ornament));
    for (const fingering of this.layout.fingerings) chordShapes[fingering.chord]?.append(drawFingering(context, fingering));
    for (const tremolo of this.layout.tremolos) chordShapes[tremolo.chord]?.append(...drawTremolo(context, tremolo));
    for (const arpeggio of this.layout.arpeggios) chordShapes[arpeggio.chords[0] ?? -1]?.append(...drawArpeggio(context, arpeggio));

    const restLayer = svg('g');
    restLayer.style.color = COLORS.note;
    for (const rest of this.layout.rests) restLayer.append(...drawRest(context, rest));
    // Bar numbers clear the notes, and volta brackets clear the bar numbers.
    const barNumbers = drawBarNumbers(context);
    restLayer.append(...barNumbers.shapes, ...drawNavigation(context, barNumbers.y));
    // Octave brackets first: the tempo marks go over the 8va ones, the pedal under the 8vb ones.
    const brackets: OctaveBracket[] = [];
    for (const shift of this.layout.octaveShifts) {
      const drawn = drawOctaveShift(context, shift);
      restLayer.append(...drawn.shapes);
      brackets.push(drawn.bracket);
    }
    // Dynamics before the pedal: those pushed under the lower staff, the pedal goes under.
    const dynamics = drawDynamics(context);
    restLayer.append(...drawPedal(context, { brackets, dynamics: dynamics.below }), ...dynamics.shapes);
    restLayer.append(...drawTempoMarks(context, brackets, barNumbers.y));

    this.strip.append(restLayer, ...chordShapes, ...graceShapes, beamLayer);
    this.lights.drawn(ink.chords, chordShapes, this.layout.graces, graceShapes);
    // The shades behind the music are few, and always shown; the layers are shown shape by shape.
    const always = new Set<Element>([this.overlay, this.loopLayer, restLayer, beamLayer]);
    this.nearView.measure([...this.strip.children, ...restLayer.children, ...beamLayer.children].filter((shape) => !always.has(shape)) as SVGElement[]);
    // Hidden before the browser first lays them out: around where the tape will stand for the music.
    this.showAround(this.motion.offset(geometry.cursorX() - geometry.px(barPosition(score, this.motion.position))));
    this.lastOffset = Number.NaN;
  }

  /** Shows the tape near the view, the strip drawn `offset` pixels along. */
  private showAround(offset: number): void {
    this.nearView.view(-offset, this.stretch.tapeInSight);
  }
}

const itself = (value: number): number => value;

/** Nothing to draw: a staff without a piece. */
const NO_LAYOUT: NotationLayout = { chords: [], octaveShifts: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [], graces: [], ornaments: [], tremolos: [], arpeggios: [], fingerings: [] };
