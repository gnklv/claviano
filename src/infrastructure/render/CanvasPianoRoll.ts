import { noteEnd, type Hand } from '../../domain/note';
import { isBlackKey } from '../../domain/pitch';
import { barNumber, firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import { approach, clampOffset, followTarget, pickSpan, type CameraView, type Span } from './keyboardCamera';
import { MAX_WHITE_KEY_PX, keyboardRange, whiteKeyCount, type KeyRange } from './keyboardRange';

export interface RollFrame {
  readonly score: Score;
  readonly position: number;
  /** The camera only returns to following the music while it is playing. */
  readonly playing: boolean;
  readonly loop: TimeRange | null;
  readonly isHandEnabled: (hand: Hand) => boolean;
  /** How to label a key on screen; the UI supplies it in the current language. */
  readonly noteLabel: (midi: number) => string;
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
  hand: { right: '#4f9dff', left: '#ff9f43' },
};

const MUTED_ALPHA = 0.25;
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

  // Camera state
  private scrollX = 0;
  private manualHold = false;
  private manualIdleSeconds = 0;
  private snapCamera = true;
  private lastPosition = 0;
  private lastRenderAt = 0;
  /** Seconds ahead shown in the current frame; less than the maximum on short screens. */
  private secondsVisible = 4;

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
    const yOf = (time: number) => rollHeight - (time - frame.position) * pxPerSecond;

    const now = performance.now();
    const dt = this.lastRenderAt ? Math.min(0.1, (now - this.lastRenderAt) / 1000) : 0;
    this.lastRenderAt = now;
    this.updateCamera(frame, dt);

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Loop and bar lines span the screen; notes and keys move with the camera.
    this.drawLoop(frame, yOf, rollHeight);
    this.drawBars(frame, yOf, rollHeight);
    ctx.save();
    ctx.translate(-this.scrollX, 0);
    const active = this.drawNotes(frame, yOf, rollHeight);
    this.drawKeyboard(rollHeight, keyboardHeight, active, frame.noteLabel);
    ctx.restore();

    ctx.fillStyle = this.colors.nowLine;
    ctx.fillRect(0, rollHeight - 1, width, 2);
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
    if (score !== this.layoutScore) this.manualHold = false;
    this.snapCamera = true;
    this.layoutScore = score;
    this.layoutWidth = width;
    this.layoutHeight = height;
  }

  private cameraView(): CameraView {
    return { contentWidth: this.contentWidth, viewWidth: this.width };
  }

  private updateCamera(frame: RollFrame, dt: number): void {
    const seeked = Math.abs(frame.position - this.lastPosition) > SEEK_THRESHOLD_SECONDS;
    this.lastPosition = frame.position;
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
      const note = score.notes[i];
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

  /** Draws visible notes and returns the pitches sounding right now with their hand. */
  private drawNotes(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): Map<number, Hand> {
    const { ctx } = this;
    const { score, position } = frame;
    const active = new Map<number, Hand>();
    const until = position + this.secondsVisible;
    const { notes } = score;
    for (let i = firstNoteAtOrAfter(score, position - this.longestNote); i < notes.length; i++) {
      const note = notes[i];
      if (note.start > until) break;
      const end = noteEnd(note);
      if (end < position) continue;
      const key = this.keys.get(note.pitch);
      if (!key) continue;

      const enabled = frame.isHandEnabled(note.hand);
      if (note.start <= position && enabled) active.set(note.pitch, note.hand);

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
    return active;
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
