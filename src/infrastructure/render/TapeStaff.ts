import type { StaffView } from '../../application/ports/StaffView';
import { barAtBeat, clefSignAt, writtenBarAt, writtenBeatAt, keySignatureAt, timeSignatureAt, type Score, type TimeRange } from '../../domain/score';
import { lastAtOrBefore } from '../../domain/search';
import type { Hand } from '../../domain/note';
import { engrave, reachOf, type NotationLayout, type StaffChord, type StaffGrace } from '../../domain/notation/engraving';
import type { ClefSign } from '../../domain/notation/written';
import { SAME_MOMENT, sameMoment } from '../../domain/moment';
import type { NoteOnPage } from '../../domain/fingering/own';
import { barPosition, tapeBars } from './staffLayout';
import { columnsOf, graceRoom } from './staff/columns';
import { StaffGeometry } from './staff/geometry';
import { drawGutter, type GutterContent } from './staff/gutter';
import { StaffInk } from './staff/ink';
import { barsShade, loopShade, noteShade } from './staff/shades';
import { COLORS, type Shape } from './staff/shapes';
import { Sounding, type Lit } from './staff/sounding';
import { tenth } from './staff/svg';
import { drawTape, type TapeDrawing } from './staff/tapeDrawing';
import { TapeMotion } from './staff/tapeMotion';
import { TapeStretch } from './staff/tapeStretch';

/*
 * A grand staff shown as a tape that scrolls under a fixed cursor, whatever it is drawn on.
 *
 * Three layers: staff lines and clefs that never move, the tape with bar lines and notes that
 * slides left, and the cursor on top. The whole tape is drawn once per score, as shapes (see
 * staff/tapeDrawing.ts); during playback it is only moved. This holds what the staff knows and does
 * whatever it is drawn on: the piece laid out, where the tape stands, what sounds, where a pointer
 * is on the page. A surface (an SVG one, a canvas one) shows what this hands it.
 */

/** What shows the staff: the left column and the tape, as this hands them to it. */
export interface StaffSurface {
  /** Behind the tape, all the view across: the staff lines, and the left column. */
  readonly background: HTMLElement | SVGElement;
  /** What it puts in the tape's box. */
  readonly tapeParts: readonly Element[];
  /** Whether it fades the tape at its ends itself (otherwise the tape's box is faded). */
  readonly fadesItself?: boolean;
  /** The view's size, as the staff is drawn for it now (after a resize, before what is drawn anew). */
  sized(width: number, height: number, tapeLeft: number): void;
  /** The staff lines and the left column, anew. */
  showBackground(shapes: readonly Shape[]): void;
  /** The tape of a piece, just drawn (null: no music), with the chords and grace notes it lights; nothing lit, nothing behind it yet. */
  showTape(drawing: TapeDrawing | null, sounds: { readonly chords: readonly StaffChord[]; readonly graces: readonly StaffGrace[] }): void;
  /** Behind the music: the bar under the pointer or the bars being selected, and the note being fingered. */
  showOverlay(shapes: readonly Shape[]): void;
  /** Behind the music: the loop's bars. */
  showLoop(shapes: readonly Shape[]): void;
  /** What sounds now is lit (the same object as last time while it is the same). */
  light(lit: Lit): void;
  /** The tape drawn `offset` pixels along, `inSight` of it in the view. */
  move(offset: number, inSight: number): void;
  /** The staff is gone: what it listens to, it stops listening to. */
  dispose?(): void;
}

/** Share of the tape's width over which each edge fades out. */
export const FADE = 0.12;
/** The tape fades out at both its ends. */
const TAPE_FADE = `linear-gradient(to right, transparent 0, #000 ${FADE * 100}%, #000 ${(1 - FADE) * 100}%, transparent 100%)`;
/**
 * Drawing the piece anew took longer than this, in milliseconds: longer than a frame lasts on a
 * screen that shows 120 of them a second. Done at a step of a size on the move, the step is seen.
 */
const FRAME_MS = 8;
/** A click within this many staff spaces of a notehead's centre means that note. */
const NOTE_SNAP = 1.2;

export class TapeStaff implements StaffView {
  private readonly tape: HTMLDivElement;
  private readonly cursor: HTMLDivElement;

  private readonly geometry = new StaffGeometry();
  private readonly ink = new StaffInk(this.geometry);
  private readonly motion = new TapeMotion();
  private readonly sounding = new Sounding();
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
  private hoverBar: number | null = null;
  /** The note being fingered, marked behind its head. */
  private picked: NoteOnPage | null = null;
  /** Whether the last drawing anew took longer than a frame (see resize). */
  private costly = false;
  private lastCursorLeft = Number.NaN;
  private selection: { from: number; to: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly surface: StaffSurface,
  ) {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = COLORS.background;

    this.tape = document.createElement('div');
    Object.assign(this.tape.style, { position: 'absolute', top: '0', bottom: '0', right: '0' });
    if (!surface.fadesItself) {
      this.tape.style.maskImage = TAPE_FADE;
      this.tape.style.setProperty('-webkit-mask-image', TAPE_FADE);
    }
    this.tape.append(...surface.tapeParts);

    this.cursor = document.createElement('div');
    Object.assign(this.cursor.style, { position: 'absolute', width: '2px', background: COLORS.cursor, borderRadius: '1px' });

    container.append(surface.background, this.tape, this.cursor);
    this.stretch = new TapeStretch(this.geometry, { background: surface.background, tape: this.tape, cursor: this.cursor }, () => this.rested());
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
    this.drawTape();
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

  dispose(): void {
    this.surface.dispose?.();
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
    this.surface.sized(this.geometry.width, this.geometry.height, this.geometry.gutterWidth());
    this.drawBackground();
    this.drawTape();
    this.costly = performance.now() - began > FRAME_MS;
  }

  /**
   * Called every frame; changes what is shown only when something changes: the tape moves, or a
   * chord starts or stops sounding. Chords of muted hands are not highlighted.
   */
  render(position: number, isHandEnabled: (hand: Hand) => boolean = () => true, playing = false): void {
    const { geometry, score } = this;
    if (score) {
      this.currentBeat = writtenBeatAt(score, position);
      if (this.gutterAt(this.currentBeat) !== this.shownGutter) this.drawBackground();
      this.surface.light(this.sounding.at(this.currentBeat, isHandEnabled));
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
    this.lastOffset = offset;
    this.surface.move(offset, this.stretch.tapeInSight);
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
    this.surface.showBackground(drawGutter(geometry, this.gutterContent()));
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
    const shades: Shape[] = [];
    if (score && score.notes.length > 0) {
      if (selection) shades.push(barsShade(this.geometry, Math.min(selection.from, selection.to), Math.max(selection.from, selection.to), 1));
      else if (this.hoverBar !== null && this.hoverBar < tapeBars(score).starts.length) shades.push(barsShade(this.geometry, this.hoverBar, this.hoverBar, 0.5));
      const head = this.picked && this.headOf(this.picked);
      if (head) shades.push(noteShade(this.geometry, head.x, head.y));
    }
    this.surface.showOverlay(shades);
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
    this.surface.showLoop(score && score.notes.length > 0 && loop ? loopShade(this.geometry, score, loop) : []);
  }

  private drawTape(): void {
    this.ink.reset();
    this.sounding.set([], []);
    const score = this.score;
    if (!score || score.notes.length === 0) {
      this.surface.showTape(null, { chords: [], graces: [] });
      return;
    }
    const { geometry, ink } = this;
    const drawing = drawTape({ score, geometry, ink }, this.layout, this.handLabels);
    this.surface.showTape(drawing, { chords: ink.chords, graces: this.layout.graces });
    this.sounding.set(ink.chords, this.layout.graces);
    this.drawOverlay();
    this.drawLoop();
    // Shown first around where the tape will stand for the music.
    this.surface.move(this.motion.offset(geometry.cursorX() - geometry.px(barPosition(score, this.motion.position))), this.stretch.tapeInSight);
    this.lastOffset = Number.NaN;
  }
}

const itself = (value: number): number => value;

/** Nothing to draw: a staff without a piece. */
const NO_LAYOUT: NotationLayout = { chords: [], octaveShifts: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [], graces: [], ornaments: [], tremolos: [], arpeggios: [], fingerings: [] };
