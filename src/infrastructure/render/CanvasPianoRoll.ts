import { noteEnd, type Hand } from '../../domain/note';
import { HIGHEST_KEY, LOWEST_KEY, isBlackKey } from '../../domain/pitch';
import { firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';

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

const COLORS = {
  background: '#14161c',
  barLine: 'rgba(255, 255, 255, 0.08)',
  barNumber: 'rgba(255, 255, 255, 0.35)',
  loop: 'rgba(120, 200, 140, 0.08)',
  nowLine: 'rgba(255, 255, 255, 0.5)',
  whiteKey: '#f4f1ea',
  blackKey: '#1d1f24',
  keyBorder: '#9a978f',
  keyLabel: '#8a877f',
  hand: { right: '#4f9dff', left: '#ff9f43' } satisfies Record<Hand, string>,
};

const WHITE_KEY_COUNT = 52;
const MUTED_ALPHA = 0.25;

/** Falling notes above an 88-key keyboard, drawn from scratch on a 2D canvas. */
export class CanvasPianoRoll {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private keys = new Map<number, KeyRect>();
  private cachedScore: Score | null = null;
  private longestNote = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly secondsVisible = 4,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
  }

  /** Call when the canvas's CSS size changes. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.keys = layoutKeys(this.width);
  }

  render(frame: RollFrame): void {
    const { ctx, width, height } = this;
    const keyboardHeight = Math.min(140, Math.max(60, height * 0.2));
    const rollHeight = height - keyboardHeight;
    const pxPerSecond = rollHeight / this.secondsVisible;
    const yOf = (time: number) => rollHeight - (time - frame.position) * pxPerSecond;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    this.drawLoop(frame, yOf, rollHeight);
    this.drawBars(frame, yOf, rollHeight);
    const active = this.drawNotes(frame, yOf, rollHeight);
    this.drawKeyboard(rollHeight, keyboardHeight, active, frame.noteLabel);

    ctx.fillStyle = COLORS.nowLine;
    ctx.fillRect(0, rollHeight - 1, width, 2);
  }

  private drawLoop(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    if (!frame.loop) return;
    const top = Math.max(0, yOf(frame.loop.end));
    const bottom = Math.min(rollHeight, yOf(frame.loop.start));
    if (bottom <= top) return;
    this.ctx.fillStyle = COLORS.loop;
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
      ctx.fillStyle = COLORS.barLine;
      ctx.fillRect(0, y, this.width, 1);
      ctx.fillStyle = COLORS.barNumber;
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
      ctx.fillStyle = COLORS.hand[note.hand];
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
        ctx.fillStyle = hand ? COLORS.hand[hand] : black ? COLORS.blackKey : COLORS.whiteKey;
        const keyHeight = black ? blackHeight : height;
        ctx.fillRect(key.x, top, key.width, keyHeight);
        if (!black) {
          ctx.strokeStyle = COLORS.keyBorder;
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
    ctx.fillStyle = COLORS.keyLabel;
    for (const [midi, key] of this.keys) {
      if (midi % 12 === 0) ctx.fillText(noteLabel(midi), key.x + key.width / 2, bottom - 4);
    }
    ctx.textAlign = 'start';
  }
}

function layoutKeys(width: number): Map<number, KeyRect> {
  const whiteWidth = width / WHITE_KEY_COUNT;
  const blackWidth = whiteWidth * 0.6;
  const keys = new Map<number, KeyRect>();
  let whiteIndex = 0;
  for (let pitch = LOWEST_KEY; pitch <= HIGHEST_KEY; pitch++) {
    if (isBlackKey(pitch)) {
      keys.set(pitch, { x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
    } else {
      keys.set(pitch, { x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex++;
    }
  }
  return keys;
}
