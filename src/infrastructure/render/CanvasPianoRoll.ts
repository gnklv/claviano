import { keyReleasesOf } from '../../domain/keys';
import { noteEnd, type Hand } from '../../domain/note';
import { barNumber, firstNoteAtOrAfter, type Score } from '../../domain/score';
import type { RollColors, RollFrame, RollView } from '../../application/ports/RollView';
import { approach, HandHold, SeekWatch } from './following';
import { clampOffset, followTarget, pickSpan, type CameraView, type Span } from './keyboardCamera';
import { drawKeyboard, layoutKeyboard, MIN_KEYBOARD_PX, type KeyRect } from './roll/keyboard';
import { RollPedals } from './roll/pedals';
import { drawTiles, fingerSize, tileAt } from './roll/tiles';

/** A click within this many pixels of a note's start (its bottom edge) means that note. */
const NOTE_SNAP_PX = 10;
/** On short screens, look less far ahead rather than squashing notes flat. */
const MIN_PX_PER_SECOND = 40;
/**
 * The camera keeps the notes of the next few seconds in view; when they don't fit together,
 * it narrows down to the nearer ones (see pickSpan)…
 */
const FOLLOW_LOOKAHEADS_SECONDS = [2, 1, 0.5];
/** …with this many white keys to spare at the edge, unless it was scrolled by hand (see following.ts). */
const FOLLOW_MARGIN_KEYS = 1;
/** The line where the music is, across the roll (pixels). */
const NOW_LINE_PX = 2;
/** A bar's number, at the left over its line: its size, and how far in and up from there (pixels). */
const BAR_NUMBER = { size: 11, left: 6, above: 2 };

/**
 * Falling notes above a piano keyboard, drawn from scratch on a 2D canvas.
 * Only the part of the keyboard the piece uses is shown (see keyboardRange). When even that
 * would make keys too narrow, the keyboard scrolls: a camera follows the music (keyboardCamera),
 * and the user can scroll by hand with scrollBy().
 */
export class CanvasPianoRoll implements RollView {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private keys: ReadonlyMap<number, KeyRect> = new Map();
  /** One size for every finger (see roll/tiles.ts). */
  private fingerSize = 0;
  private keyboardHeight = MIN_KEYBOARD_PX;
  private keyWidth = 0;
  /** Width of the whole keyboard; more than the canvas width when it scrolls. */
  private contentWidth = 0;
  /** What the current key layout was computed for; it is redone when any of these change. */
  private layoutScore: Score | null = null;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private colors: RollColors;
  private longestNote = 0;
  /** The current score's pedals. */
  private pedals: RollPedals | null = null;

  // Camera state
  private scrollX = 0;
  /** Scrolled by hand: the camera stays where it was put. */
  private readonly scrolled = new HandHold<true>();
  private snapCamera = true;
  private readonly seeks = new SeekWatch();
  private lastRenderAt = 0;
  /** What the last frame drawn showed: a frame that would show the same is not drawn (see render). */
  private drawn: unknown[] | null = null;
  /** Seconds ahead shown in the current frame; less than the maximum on short screens. */
  private secondsVisible = 4;
  /** The moment the notes were dragged to, away from the music (see browseBy). */
  private readonly browsed = new HandHold<number>();
  /** Let go, the notes glide back to the music: how far from it they still are, in pixels. */
  private returning = 0;
  /** What the last frame showed, to turn a click's height into a moment of the music. */
  private lastFrame: { score: Score; position: number; rollHeight: number; pxPerSecond: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** The theme's colours, as the interface reads them (and gives anew on a switch: setColors). */
    colors: RollColors,
    /** How far ahead the falling notes reach, when there is enough height for it. */
    private readonly maxSecondsVisible = 4,
  ) {
    this.colors = colors;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
  }

  setColors(colors: RollColors): void {
    this.colors = colors;
    this.drawn = null;
  }

  /** The note (its place in `score.notes`) whose tile is under the pointer, or null. */
  noteAt(clientX: number, clientY: number): number | null {
    const frame = this.lastFrame;
    if (!frame) return null;
    const { score, position, rollHeight, pxPerSecond } = frame;
    const rect = this.canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    if (y < 0 || y > rollHeight) return null;
    return tileAt(score, this.keys, this.longestNote, clientX - rect.left + this.scrollX, position + (rollHeight - y) / pxPerSecond, pxPerSecond);
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
  scrollBy(dx: number): number {
    if (!this.scrollable) return 0;
    const before = this.scrollX;
    this.scrollX = clampOffset(this.scrollX + dx, this.cameraView());
    this.scrolled.hold(true);
    return this.scrollX - before;
  }

  /** Call when the canvas's CSS size changes. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // (A canvas given a new size is blank.)
    this.drawn = null;
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
    const seeked = this.seeks.seeked(frame.position);

    // The notes are drawn at the moment in view: where the music is, unless dragged elsewhere.
    const shown = { ...frame, position: this.viewTime(frame, dt, pxPerSecond, seeked) };
    const yOf = (time: number) => rollHeight - (time - shown.position) * pxPerSecond;
    this.lastFrame = { score: frame.score, position: shown.position, rollHeight, pxPerSecond };
    this.updateCamera(shown, dt, seeked);

    // Nothing to draw anew when nothing drawn would change: a piece at rest, with nobody moving it.
    // (A page that is only looked at should not keep the processor busy, on a phone least of all.)
    const what = [
      frame.score,
      frame.position,
      shown.position,
      this.scrollX,
      frame.playing,
      frame.loop?.start,
      frame.loop?.end,
      frame.isHandEnabled('right'),
      frame.isHandEnabled('left'),
      frame.pedalEnabled,
      // (The language the keys are labelled in.)
      frame.noteLabel(60),
      frame.fingers,
      frame.picked,
      width,
      height,
    ];
    if (this.drawn && what.every((value, i) => value === this.drawn![i])) return;
    this.drawn = what;

    const pen = { ctx, colors: this.colors };
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Loop and bar lines span the screen; notes and keys move with the camera.
    this.drawLoop(shown, yOf, rollHeight);
    this.drawBars(shown, yOf, rollHeight);
    ctx.save();
    ctx.translate(-this.scrollX, 0);
    const until = shown.position + this.secondsVisible;
    drawTiles(pen, shown, { keys: this.keys, yOf, rollHeight, until, longestNote: this.longestNote, fingerSize: this.fingerSize });
    // The keys show what sounds now, even while the notes above are dragged elsewhere.
    drawKeyboard(pen, this.keys, rollHeight, keyboardHeight, this.soundingAt(frame), frame.noteLabel, width);
    ctx.restore();

    ctx.fillStyle = this.colors.nowLine;
    ctx.fillRect(0, rollHeight - NOW_LINE_PX / 2, width, NOW_LINE_PX);
    // Dragged away: a line marks where the music is, if it is in sight.
    const playing = yOf(frame.position);
    if (shown.position !== frame.position && playing >= 0 && playing <= rollHeight - NOW_LINE_PX) {
      ctx.fillStyle = this.colors.cursor;
      ctx.fillRect(0, playing - NOW_LINE_PX / 2, width, NOW_LINE_PX);
    }
    if (this.pedals?.any) {
      this.pedals.drawLabels(pen, shown, yOf, rollHeight, until, width);
      this.pedals.drawPedals(pen, frame, rollHeight, width);
    }
  }

  /**
   * Drags the notes up or down by `seconds` of music (down: later music comes into view). The
   * music plays on; after a while of playing the view goes back to it, like a keyboard scrolled by hand.
   */
  browseBy(seconds: number): number {
    const frame = this.lastFrame;
    if (!frame) return 0;
    // (From where they were dragged to last, drawn yet or not: several moves between two frames add up.)
    const before = this.browsed.value ?? frame.position;
    const time = Math.min(frame.score.duration, Math.max(0, before + seconds));
    this.browsed.hold(time);
    this.returning = 0;
    return time - before;
  }

  /** Back to following the music at once (after a jump). */
  followMusic(): void {
    this.browsed.release();
    this.returning = 0;
  }

  /** The moment in view: the music's position, or where the notes were dragged to (easing back after a while). */
  private viewTime(frame: RollFrame, dt: number, pxPerSecond: number, seeked: boolean): number {
    if (seeked) {
      this.followMusic();
      return frame.position;
    }
    const letGo = this.browsed.pass(dt, frame.playing, false);
    if (letGo !== null) this.returning = (letGo - frame.position) * pxPerSecond;
    const held = this.browsed.value;
    if (held !== null) return held;
    // Glide back by shrinking the distance to the music, not by chasing the music itself: it keeps
    // moving, and a glide towards a moving target never quite arrives. In pixels, so the return
    // looks the same at any zoom.
    this.returning = approach(this.returning, 0, dt);
    return frame.position + this.returning / pxPerSecond;
  }

  /** The keys sounding at the music's position, with their hand (muted hands are not shown pressed). */
  private soundingAt(frame: RollFrame): Map<number, Hand> {
    const active = new Map<number, Hand>();
    const { score, position } = frame;
    // A key is down until its finger leaves it: a moment before the same key is struck again.
    const releases = keyReleasesOf(score);
    for (let i = firstNoteAtOrAfter(score, position - this.longestNote); i < score.notes.length; i++) {
      const note = score.notes[i]!;
      if (note.start > position) break;
      if (releases[i]! >= position && frame.isHandEnabled(note.hand)) active.set(note.pitch, note.hand);
    }
    return active;
  }

  /** Lays the keyboard out for the piece and the canvas's size (see roll/keyboard.ts). */
  private layoutKeyboard(score: Score): void {
    const { width, height } = this;
    const layout = layoutKeyboard(score, width, height);
    this.keys = layout.keys;
    this.fingerSize = fingerSize(this.ctx, layout.keys);
    this.keyWidth = layout.keyWidth;
    this.contentWidth = layout.contentWidth;
    this.keyboardHeight = layout.height;
    this.longestNote = score.notes.reduce((max, n) => Math.max(max, n.duration), 0);
    if (score !== this.layoutScore) this.pedals = new RollPedals(score);
    if (score !== this.layoutScore) this.scrolled.release();
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

    // Scrolled by hand, the camera waits; a jump in the music sends it back at once.
    if (this.scrolled.value !== null && this.scrolled.pass(dt, frame.playing, seeked) === null) return;

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
    // A line at each end that is in sight: where the music turns back, and where it comes back to.
    this.ctx.fillStyle = this.colors.loopEdge;
    for (const y of [yOf(frame.loop.end), yOf(frame.loop.start)]) {
      if (y >= 0 && y <= rollHeight) this.ctx.fillRect(0, Math.round(y), this.width, 1);
    }
  }

  private drawBars(frame: RollFrame, yOf: (t: number) => number, rollHeight: number): void {
    const { ctx } = this;
    if (frame.score.notes.length === 0) return;
    const until = frame.position + this.secondsVisible;
    ctx.font = `${BAR_NUMBER.size}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    frame.score.bars.forEach((time, index) => {
      if (time < frame.position || time > until) return;
      const y = yOf(time);
      if (y > rollHeight) return;
      ctx.fillStyle = this.colors.barLine;
      ctx.fillRect(0, y, this.width, 1);
      ctx.fillStyle = this.colors.barNumber;
      ctx.fillText(String(barNumber(frame.score, index)), BAR_NUMBER.left, y - BAR_NUMBER.above);
    });
  }

}
