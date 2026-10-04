import { noteEnd, type Hand } from '../../domain/note';
import { pedalDownAt, pedalEvents, type PedalEvent, type PedalKind, type PedalSpan } from '../../domain/pedal';
import { isBlackKey } from '../../domain/pitch';
import { barNumber, firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import { approach, clampOffset, followTarget, pickSpan, type CameraView, type Span } from './keyboardCamera';
import { MAX_WHITE_KEY_PX, keyboardRange, whiteKeyCount, type KeyRange } from './keyboardRange';

/** A move of one of the three pedals. */
export interface PedalMove extends PedalEvent {
  readonly pedal: PedalKind;
}

export interface RollFrame {
  readonly score: Score;
  readonly position: number;
  /** The camera only returns to following the music while it is playing. */
  readonly playing: boolean;
  readonly loop: TimeRange | null;
  readonly isHandEnabled: (hand: Hand) => boolean;
  /** Whether the score's pedal is played; when it is not, the pedal marks are dimmed. */
  readonly pedalEnabled: boolean;
  /** How to label a key on screen; the UI supplies it in the current language. */
  readonly noteLabel: (midi: number) => string;
  /** How to label a pedal move ("Pedal ↓"), in the current language. */
  readonly pedalLabel: (move: PedalMove) => string;
}

interface KeyRect {
  readonly x: number;
  readonly width: number;
  readonly black: boolean;
}

/** Canvas cannot use CSS variables, so the UI resolves the theme's colors and passes them in. */
export interface RollColors {
  readonly background: string;
  readonly barLine: string;
  readonly barNumber: string;
  readonly loop: string;
  readonly nowLine: string;
  readonly whiteKey: string;
  readonly blackKey: string;
  readonly keyBorder: string;
  readonly keyLabel: string;
  readonly pedal: string;
  /** Where the music is, when the notes are dragged elsewhere. */
  readonly cursor: string;
  readonly hand: Readonly<Record<Hand, string>>;
}

/** Used until the UI supplies the theme's colors. */
const DEFAULT_COLORS: RollColors = {
  background: '#14161c',
  barLine: 'rgba(255, 255, 255, 0.08)',
  barNumber: 'rgba(255, 255, 255, 0.35)',
  loop: 'rgba(120, 200, 140, 0.08)',
  nowLine: 'rgba(255, 255, 255, 0.5)',
  whiteKey: '#f4f1ea',
  blackKey: '#1d1f24',
  keyBorder: '#9a978f',
  keyLabel: '#8a877f',
  pedal: 'rgba(180, 140, 255, 0.85)',
  cursor: 'rgba(79, 157, 255, 0.9)',
  hand: { right: '#4f9dff', left: '#ff9f43' },
};

const MUTED_ALPHA = 0.25;
/** A click within this many pixels of a note's start (its bottom edge) means that note. */
const NOTE_SNAP_PX = 10;
/*
 * The pedals. Where a foot moves, a plain label falls with the notes near the right edge
 * ("Pedal ↓", "Pedal ↑", "Pedal ↑↓" for a change, "Left pedal ↓"…; the staff keeps the sheet-music
 * signs). It lands beside three piano pedals in the corner over the keyboard; each lights up and
 * sinks while held, and comes up for a moment at a change.
 */
const PEDAL_LABEL_PX = 13;
/** MIDI players lift and press again in a flash; a gap this short (seconds) is one change. */
const PEDAL_CHANGE_GAP_SECONDS = 0.15;
/** How long (seconds of music) the pedal in the corner stays up at a change, so the change is seen. */
const PEDAL_CHANGE_FLASH_SECONDS = 0.15;
const PEDAL_ICON = { width: 11, height: 26, gap: 5, margin: 10, travel: 4 };
/** The pedals in the corner, left to right, as on a piano. */
const PEDAL_ORDER: readonly PedalKind[] = ['soft', 'sostenuto', 'sustain'];
/** On short screens, look less far ahead rather than squashing notes flat. */
const MIN_PX_PER_SECOND = 40;
/*
 * Keyboard proportions. A white key looks right when it is about four times as long as it is wide
 * and turns into a square below ~2.5. The keyboard takes at most this share of the canvas height;
 * when that is too short, more octaves are shown so the keys get narrower instead of squarer.
 */
const KEY_LENGTH_RATIO = 4;
const MIN_KEY_LENGTH_RATIO = 2.5;
const MAX_KEYBOARD_SHARE = 0.45;
const MIN_KEYBOARD_PX = 40;
const MAX_KEYBOARD_PX = 140;
/*
 * Scrolling. When the piece's range would make white keys narrower than SCROLL_BELOW_PX,
 * keys get SCROLL_KEY_PX instead and the keyboard becomes wider than the screen.
 */
const SCROLL_BELOW_PX = 16;
const SCROLL_KEY_PX = 20;
/**
 * The camera keeps the notes of the next few seconds in view; when they don't fit together,
 * it narrows down to the nearer ones (see pickSpan)…
 */
const FOLLOW_LOOKAHEADS_SECONDS = [2, 1, 0.5];
/** …with this many white keys to spare at the edge… */
const FOLLOW_MARGIN_KEYS = 1;
/** …unless the user scrolled by hand; then it waits this long (of playing time) before following again. */
const MANUAL_HOLD_SECONDS = 3;
/** A position change bigger than this between frames is a seek: the camera jumps instead of gliding. */
const SEEK_THRESHOLD_SECONDS = 0.5;

/**
 * Falling notes above a piano keyboard, drawn from scratch on a 2D canvas.
 * Only the part of the keyboard the piece uses is shown (see keyboardRange). When even that
 * would make keys too narrow, the keyboard scrolls: a camera follows the music (keyboardCamera),
 * and the user can scroll by hand with scrollBy().
 */
export class CanvasPianoRoll {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private keys = new Map<number, KeyRect>();
  private keyboardHeight = MIN_KEYBOARD_PX;
  private keyWidth = 0;
  /** Width of the whole keyboard; more than the canvas width when it scrolls. */
  private contentWidth = 0;
  /** What the current key layout was computed for; it is redone when any of these change. */
  private layoutScore: Score | null = null;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private colors: RollColors = DEFAULT_COLORS;
  private longestNote = 0;
  /** Where each pedal moves in the current score, in time order; and all of them together. */
  private pedalMoves: Record<PedalKind, PedalEvent[]> = { sustain: [], sostenuto: [], soft: [] };
  private pedalMoments: PedalMove[] = [];

  // Camera state
  private scrollX = 0;
  private manualHold = false;
  private manualIdleSeconds = 0;
  private snapCamera = true;
  private lastPosition = 0;
  private lastRenderAt = 0;
  /** Seconds ahead shown in the current frame; less than the maximum on short screens. */
  private secondsVisible = 4;
  /**
   * The notes dragged away from the music (see browseBy), or null while they follow it. While
   * going back, `returning` is how far from the music they are, in pixels; otherwise false.
   */
  private view: { time: number; idle: number; returning: number | false } | null = null;
  /** What the last frame showed, to turn a click's height into a moment of the music. */
  private lastFrame: { score: Score; position: number; rollHeight: number; pxPerSecond: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** How far ahead the falling notes reach, when there is enough height for it. */
    private readonly maxSecondsVisible = 4,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
  }

  setColors(colors: RollColors): void {
    this.colors = colors;
  }

  /**
   * The moment of the music at height `clientY` over the falling notes, or null over the keyboard.
   * A click on or just beside the bottom of a note means that note: it snaps to the note's start.
   */
  timeAt(clientY: number): number | null {
    const frame = this.lastFrame;
    if (!frame || frame.score.notes.length === 0) return null;
    const { score, position, rollHeight, pxPerSecond } = frame;
    const y = clientY - this.canvas.getBoundingClientRect().top;
    if (y < 0 || y > rollHeight) return null;
    const time = position + (rollHeight - y) / pxPerSecond;
    const snap = NOTE_SNAP_PX / pxPerSecond;
    let best = time;
    let bestDistance = snap;
    for (let i = firstNoteAtOrAfter(score, time - snap); i < score.notes.length; i++) {
      const start = score.notes[i]!.start;
      if (start > time + snap) break;
      if (Math.abs(start - time) <= bestDistance) {
        best = start;
        bestDistance = Math.abs(start - time);
      }
    }
    return Math.min(score.duration, Math.max(0, best));
  }

  /** How many seconds of music one pixel of height stands for, as last drawn (for dragging the notes). */
  get secondsPerPixel(): number | null {
    return this.lastFrame ? 1 / this.lastFrame.pxPerSecond : null;
  }

  /** True when the keyboard is wider than the screen and can be scrolled. */
  get scrollable(): boolean {
    return this.contentWidth > this.width + 1;
  }

  /** Manual scrolling (swipe, trackpad). Pauses the camera until the music plays on for a while. */
  scrollBy(dx: number): void {
    if (!this.scrollable) return;
    this.scrollX = clampOffset(this.scrollX + dx, this.cameraView());
    this.manualHold = true;
    this.manualIdleSeconds = 0;
  }

  /** Call when the canvas's CSS size changes. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(frame: RollFrame): void {
    const { ctx, width, height } = this;
    if (frame.score !== this.layoutScore || width !== this.layoutWidth || height !== this.layoutHeight) {
      this.layoutKeyboard(frame.score);
    }
    const { keyboardHeight } = this;
    const rollHeight = height - keyboardHeight;
    this.secondsVisible = Math.min(this.maxSecondsVisible, Math.max(0.5, rollHeight / MIN_PX_PER_SECOND));
    const pxPerSecond = rollHeight / this.secondsVisible;

    const now = performance.now();
    const dt = this.lastRenderAt ? Math.min(0.1, (now - this.lastRenderAt) / 1000) : 0;
    this.lastRenderAt = now;
    const seeked = Math.abs(frame.position - this.lastPosition) > SEEK_THRESHOLD_SECONDS;
    this.lastPosition = frame.position;

    // The notes are drawn at the moment in view: where the music is, unless dragged elsewhere.
    const shown = { ...frame, position: this.viewTime(frame, dt, pxPerSecond, seeked) };
    const yOf = (time: number) => rollHeight - (time - shown.position) * pxPerSecond;
    this.lastFrame = { score: frame.score, position: shown.position, rollHeight, pxPerSecond };
    this.updateCamera(shown, dt, seeked);

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Loop and bar lines span the screen; notes and keys move with the camera.
    this.drawLoop(shown, yOf, rollHeight);
    this.drawBars(shown, yOf, rollHeight);
    ctx.save();
    ctx.translate(-this.scrollX, 0);
    this.drawNotes(shown, yOf, rollHeight);
    // The keys show what sounds now, even while the notes above are dragged elsewhere.
    this.drawKeyboard(rollHeight, keyboardHeight, this.soundingAt(frame), frame.noteLabel);
    ctx.restore();

    ctx.fillStyle = this.colors.nowLine;
    ctx.fillRect(0, rollHeight - 1, width, 2);
    // Dragged away: a line marks where the music is, if it is in sight.
    const playing = yOf(frame.position);
    if (this.view && playing >= 0 && playing <= rollHeight - 2) {
      ctx.fillStyle = this.colors.cursor;
      ctx.fillRect(0, playing - 1, width, 2);
    }
    if (this.pedalMoments.length > 0) {
      this.drawPedalMoments(shown, yOf, rollHeight);
      this.drawPedals(frame, rollHeight);
    }
  }

  /**
   * Drags the notes up or down by `seconds` of music (down: later music comes into view). The
   * music plays on; after a while of playing the view goes back to it, like a keyboard scrolled by hand.
   */
  browseBy(seconds: number): void {
    const frame = this.lastFrame;
    if (!frame) return;
    const time = Math.min(frame.score.duration, Math.max(0, frame.position + seconds));
    this.view = { time, idle: 0, returning: false };
  }

  /** Back to following the music at once (after a jump). */
  followMusic(): void {
    this.view = null;
  }

  /** The moment in view: the music's position, or where the notes were dragged to (easing back after a while). */
  private viewTime(frame: RollFrame, dt: number, pxPerSecond: number, seeked: boolean): number {
    const view = this.view;
    if (!view || seeked) {
      this.view = null;
      return frame.position;
    }
    if (view.returning !== false) {
      // Glide back by shrinking the distance to the music, not by chasing the music itself: it keeps
      // moving, and a glide towards a moving target never quite arrives. In pixels, so the return
      // looks the same at any zoom.
      view.returning = approach(view.returning, 0, dt);
      if (view.returning === 0) {
        this.view = null;
        return frame.position;
      }
      view.time = frame.position + view.returning / pxPerSecond;
    } else if (frame.playing) {
      view.idle += dt;
      if (view.idle >= MANUAL_HOLD_SECONDS) view.returning = (view.time - frame.position) * pxPerSecond;
    }
    return view.time;
  }

  /** The keys sounding at the music's position, with their hand (muted hands are not shown pressed). */
  private soundingAt(frame: RollFrame): Map<number, Hand> {
    const active = new Map<number, Hand>();
    const { score, position } = frame;
    for (let i = firstNoteAtOrAfter(score, position - this.longestNote); i < score.notes.length; i++) {
      const note = score.notes[i]!;
      if (note.start > position) break;
      if (noteEnd(note) >= position && frame.isHandEnabled(note.hand)) active.set(note.pitch, note.hand);
    }
    return active;
  }

  /** A label wherever a foot moves, falling with the notes near the right edge; over them, with a halo to stay legible. */
  private drawPedalMoments(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    const { ctx, width } = this;
    const until = frame.position + this.secondsVisible;
    // Labels land just left of the pedals in the corner, rather than on top of them.
    const { width: w, gap, margin } = PEDAL_ICON;
    const labelRight = width - margin - 3 * w - 2 * gap - 8;
    ctx.save();
    ctx.globalAlpha = frame.pedalEnabled ? 1 : MUTED_ALPHA;
    ctx.fillStyle = this.colors.pedal;
    ctx.strokeStyle = this.colors.background;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.font = `600 ${PEDAL_LABEL_PX}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    let stacked = 0; // labels of several pedals at one moment stack upwards
    let previous = Number.NaN;
    for (const moment of this.pedalMoments) {
      if (moment.time < frame.position) continue;
      if (moment.time > until) break;
      stacked = moment.time === previous ? stacked + 1 : 0;
      previous = moment.time;
      const y = yOf(moment.time);
      if (y > rollHeight) continue;
      const label = frame.pedalLabel(moment);
      const labelY = y - 3 - stacked * (PEDAL_LABEL_PX + 3);
      ctx.strokeText(label, labelRight, labelY);
      ctx.fillText(label, labelRight, labelY);
    }
    ctx.restore();
  }

  /** Whether a pedal is being changed at `time`: lifted and pressed again at once, shown as briefly up. */
  private changingAt(pedal: PedalKind, time: number): boolean {
    // The last move at or before `time` (moves are in time order).
    const moments = this.pedalMoves[pedal];
    let lo = 0;
    let hi = moments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (moments[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    const latest = moments[lo - 1];
    return latest?.kind === 'change' && time - latest.time < PEDAL_CHANGE_FLASH_SECONDS;
  }

  /** Three piano pedals in the corner over the keyboard, each lit and sunk while held. */
  private drawPedals(frame: RollFrame, rollHeight: number): void {
    const { ctx } = this;
    const { width: w, height: h, gap, margin, travel } = PEDAL_ICON;
    const spans: Record<PedalKind, readonly PedalSpan[]> = {
      sustain: frame.score.pedal,
      sostenuto: frame.score.sostenutoPedal,
      soft: frame.score.softPedal,
    };
    const left = this.width - margin - 3 * w - 2 * gap;
    const top = rollHeight - margin - h - travel;
    ctx.save();
    ctx.globalAlpha = frame.pedalEnabled ? 1 : MUTED_ALPHA;
    PEDAL_ORDER.forEach((pedal, i) => {
      const down = frame.pedalEnabled && pedalDownAt(spans[pedal], frame.position) && !this.changingAt(pedal, frame.position);
      ctx.fillStyle = down ? this.colors.pedal : this.colors.keyBorder;
      ctx.beginPath();
      ctx.roundRect(left + i * (w + gap), top + (down ? travel : 0), w, h, [2, 2, w / 2, w / 2]);
      ctx.fill();
    });
    ctx.restore();
  }

  /** Picks the keyboard's range and height together, so keys keep piano-like proportions. */
  private layoutKeyboard(score: Score): void {
    const { width, height } = this;
    const tallest = Math.max(MIN_KEYBOARD_PX, Math.min(MAX_KEYBOARD_PX, height * MAX_KEYBOARD_SHARE));
    const maxKeyWidth = Math.min(MAX_WHITE_KEY_PX, tallest / MIN_KEY_LENGTH_RATIO);
    const range = keyboardRange(score, width, maxKeyWidth);
    const whiteKeys = whiteKeyCount(range);
    const fitWidth = width / whiteKeys;
    const keyWidth = fitWidth >= SCROLL_BELOW_PX ? fitWidth : Math.min(SCROLL_KEY_PX, maxKeyWidth);

    this.keys = layoutKeys(keyWidth, range);
    this.keyWidth = keyWidth;
    this.contentWidth = whiteKeys * keyWidth;
    this.keyboardHeight = Math.min(tallest, Math.max(MIN_KEYBOARD_PX, keyWidth * KEY_LENGTH_RATIO));
    this.longestNote = score.notes.reduce((max, n) => Math.max(max, n.duration), 0);
    if (score !== this.layoutScore) {
      this.pedalMoves = {
        sustain: pedalEvents(score.pedal, PEDAL_CHANGE_GAP_SECONDS),
        sostenuto: pedalEvents(score.sostenutoPedal),
        soft: pedalEvents(score.softPedal),
      };
      this.pedalMoments = PEDAL_ORDER.flatMap((pedal) => this.pedalMoves[pedal].map((move) => ({ ...move, pedal }))).sort(
        (a, b) => a.time - b.time,
      );
    }
    if (score !== this.layoutScore) this.manualHold = false;
    this.snapCamera = true;
    this.layoutScore = score;
    this.layoutWidth = width;
    this.layoutHeight = height;
  }

  private cameraView(): CameraView {
    return { contentWidth: this.contentWidth, viewWidth: this.width };
  }

  private updateCamera(frame: RollFrame, dt: number, seeked: boolean): void {
    if (!this.scrollable) {
      this.scrollX = 0;
      return;
    }

    // After a manual scroll the camera waits; the wait only counts down while the music plays.
    if (this.manualHold) {
      if (!frame.playing) return;
      this.manualIdleSeconds += dt;
      if (this.manualIdleSeconds < MANUAL_HOLD_SECONDS) return;
      this.manualHold = false;
    }

    const view = this.cameraView();
    const margin = FOLLOW_MARGIN_KEYS * this.keyWidth;
    const spans = FOLLOW_LOOKAHEADS_SECONDS.map((seconds) => this.upcomingSpan(frame, seconds));
    const target = followTarget(this.scrollX, pickSpan(spans, view.viewWidth, margin), view, margin);
    this.scrollX = this.snapCamera || seeked ? target : approach(this.scrollX, target, dt);
    this.snapCamera = false;
  }

  /** Where on the keyboard the notes sounding now and in the next `seconds` are. */
  private upcomingSpan(frame: RollFrame, seconds: number): Span | null {
    const { score, position } = frame;
    const until = position + seconds;
    let left = Infinity;
    let right = -Infinity;
    for (let i = firstNoteAtOrAfter(score, position - this.longestNote); i < score.notes.length; i++) {
      const note = score.notes[i]!;
      if (note.start > until) break;
      if (noteEnd(note) <= position) continue;
      const key = this.keys.get(note.pitch);
      if (!key) continue;
      left = Math.min(left, key.x);
      right = Math.max(right, key.x + key.width);
    }
    return left <= right ? { left, right } : null;
  }

  private drawLoop(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    if (!frame.loop) return;
    const top = Math.max(0, yOf(frame.loop.end));
    const bottom = Math.min(rollHeight, yOf(frame.loop.start));
    if (bottom <= top) return;
    this.ctx.fillStyle = this.colors.loop;
    this.ctx.fillRect(0, top, this.width, bottom - top);
  }

  private drawBars(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    const { ctx } = this;
    if (frame.score.notes.length === 0) return;
    const until = frame.position + this.secondsVisible;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    frame.score.bars.forEach((time, index) => {
      if (time < frame.position || time > until) return;
      const y = yOf(time);
      if (y > rollHeight) return;
      ctx.fillStyle = this.colors.barLine;
      ctx.fillRect(0, y, this.width, 1);
      ctx.fillStyle = this.colors.barNumber;
      ctx.fillText(String(barNumber(frame.score, index)), 6, y - 2);
    });
  }

  /** Draws the notes in view. */
  private drawNotes(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    const { ctx } = this;
    const { score, position } = frame;
    const until = position + this.secondsVisible;
    const { notes } = score;
    for (let i = firstNoteAtOrAfter(score, position - this.longestNote); i < notes.length; i++) {
      const note = notes[i]!;
      if (note.start > until) break;
      const end = noteEnd(note);
      if (end < position) continue;
      const key = this.keys.get(note.pitch);
      if (!key) continue;

      const enabled = frame.isHandEnabled(note.hand);

      const top = yOf(end);
      const bottom = Math.min(rollHeight, yOf(note.start));
      const inset = key.black ? 1 : 2;
      ctx.globalAlpha = enabled ? 1 : MUTED_ALPHA;
      ctx.fillStyle = this.colors.hand[note.hand];
      ctx.beginPath();
      ctx.roundRect(key.x + inset, top, key.width - inset * 2, Math.max(2, bottom - top), 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawKeyboard(
    top: number,
    height: number,
    active: Map<number, Hand>,
    noteLabel: (midi: number) => string,
  ): void {
    const { ctx } = this;
    const blackHeight = height * 0.62;
    for (const black of [false, true]) {
      for (const [pitch, key] of this.keys) {
        if (key.black !== black) continue;
        const hand = active.get(pitch);
        ctx.fillStyle = hand ? this.colors.hand[hand] : black ? this.colors.blackKey : this.colors.whiteKey;
        const keyHeight = black ? blackHeight : height;
        ctx.fillRect(key.x, top, key.width, keyHeight);
        if (!black) {
          ctx.strokeStyle = this.colors.keyBorder;
          ctx.strokeRect(key.x + 0.5, top + 0.5, key.width - 1, keyHeight - 1);
        }
      }
    }
    this.drawDoLabels(top + height, noteLabel);
  }

  /** Every Do is labelled as a landmark for finding your place on the keyboard. */
  private drawDoLabels(bottom: number, noteLabel: (midi: number) => string): void {
    const { ctx } = this;
    const fontSize = Math.max(7, Math.min(11, this.width / 110));
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.colors.keyLabel;
    for (const [midi, key] of this.keys) {
      if (midi % 12 === 0) ctx.fillText(noteLabel(midi), key.x + key.width / 2, bottom - 4);
    }
    ctx.textAlign = 'start';
  }
}

function layoutKeys(whiteWidth: number, range: KeyRange): Map<number, KeyRect> {
  const blackWidth = whiteWidth * 0.6;
  const keys = new Map<number, KeyRect>();
  let whiteIndex = 0;
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (isBlackKey(pitch)) {
      keys.set(pitch, { x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
    } else {
      keys.set(pitch, { x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex++;
    }
  }
  return keys;
}
