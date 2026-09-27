import { noteEnd, type Hand } from '../../domain/note';
import { isBlackKey } from '../../domain/pitch';
import { firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import { MAX_WHITE_KEY_PX, keyboardRange, whiteKeyCount, type KeyRange } from './keyboardRange';

export interface RollFrame {
  readonly score: Score;
  readonly position: number;
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

/**
 * Falling notes above a piano keyboard, drawn from scratch on a 2D canvas.
 * Only the part of the keyboard the piece uses is shown (see keyboardRange).
 */
export class CanvasPianoRoll {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private keys = new Map<number, KeyRect>();
  private keyboardHeight = MIN_KEYBOARD_PX;
  /** What the current key layout was computed for; it is redone when any of these change. */
  private layoutScore: Score | null = null;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private colors: RollColors = DEFAULT_COLORS;
  private cachedScore: Score | null = null;
  private longestNote = 0;
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

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    this.drawLoop(frame, yOf, rollHeight);
    this.drawBars(frame, yOf, rollHeight);
    const active = this.drawNotes(frame, yOf, rollHeight);
    this.drawKeyboard(rollHeight, keyboardHeight, active, frame.noteLabel);

    ctx.fillStyle = this.colors.nowLine;
    ctx.fillRect(0, rollHeight - 1, width, 2);
  }

  /** Picks the keyboard's range and height together, so keys keep piano-like proportions. */
  private layoutKeyboard(score: Score): void {
    const { width, height } = this;
    const tallest = Math.max(MIN_KEYBOARD_PX, Math.min(MAX_KEYBOARD_PX, height * MAX_KEYBOARD_SHARE));
    const maxKeyWidth = Math.min(MAX_WHITE_KEY_PX, tallest / MIN_KEY_LENGTH_RATIO);
    const range = keyboardRange(score, width, maxKeyWidth);
    const keyWidth = width / whiteKeyCount(range);

    this.keys = layoutKeys(width, range);
    this.keyboardHeight = Math.min(tallest, Math.max(MIN_KEYBOARD_PX, keyWidth * KEY_LENGTH_RATIO));
    this.layoutScore = score;
    this.layoutWidth = width;
    this.layoutHeight = height;
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
      ctx.fillText(String(index + 1), 6, y - 2);
    });
  }

  /** Draws visible notes and returns the pitches sounding right now with their hand. */
  private drawNotes(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): Map<number, Hand> {
    const { ctx } = this;
    const { score, position } = frame;
    if (score !== this.cachedScore) {
      this.cachedScore = score;
      this.longestNote = score.notes.reduce((max, n) => Math.max(max, n.duration), 0);
    }

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

function layoutKeys(width: number, range: KeyRange): Map<number, KeyRect> {
  const whiteWidth = width / whiteKeyCount(range);
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
