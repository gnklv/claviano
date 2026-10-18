import { keyReleasesOf } from '../../domain/keys';
import type { Fingering } from '../../domain/fingering/own';
import { noteEnd, type Hand } from '../../domain/note';
import { pedalDownAt, pedalEvents, type PedalEvent, type PedalKind, type PedalSpan } from '../../domain/pedal';
import { isBlackKey } from '../../domain/pitch';
import { barNumber, firstNoteAtOrAfter, type Score } from '../../domain/score';
import type { PedalMove, RollColors, RollFrame, RollView } from '../../application/ports/RollView';
import { approach, HandHold, SeekWatch } from './following';
import { clampOffset, followTarget, pickSpan, type CameraView, type Span } from './keyboardCamera';
import { MAX_WHITE_KEY_PX, keyboardRange, whiteKeyCount, type KeyRange } from './keyboardRange';

interface KeyRect {
  readonly x: number;
  readonly width: number;
  readonly black: boolean;
}

/** Used until the UI supplies the theme's colors. */
const DEFAULT_COLORS: RollColors = {
  background: '#14161c',
  barLine: 'rgba(255, 255, 255, 0.08)',
  barNumber: 'rgba(255, 255, 255, 0.35)',
  loop: 'rgba(255, 250, 240, 0.06)',
  loopEdge: 'rgba(255, 250, 240, 0.4)',
  nowLine: 'rgba(255, 255, 255, 0.5)',
  whiteKey: '#f4f1ea',
  blackKey: '#1d1f24',
  keyBorder: '#9a978f',
  keyLabel: '#8a877f',
  pedal: '#ece7de',
  cursor: 'rgba(79, 157, 255, 0.9)',
  hand: { right: '#8fa9c0', left: '#8f7a5c' },
};

const MUTED_ALPHA = 0.25;
/** A click within this many pixels of a note's start (its bottom edge) means that note. */
const NOTE_SNAP_PX = 10;
/** A press this near a tile, beside it or past its end, is on it: a fingertip is wider than a black key's tile (pixels). */
const TILE_SNAP_PX = 6;
/** The ring round a picked tile, and how far out from it (pixels). */
const PICKED_RING_PX = 2;
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
/** A finger printed on a tile: this tall, as large as reads from the bench, and not printed where a tile is too narrow for a figure this small (pixels). */
const FINGER_PX = 18;
const MIN_FINGER_PX = 9;
/** The figures' face, as wide as each system draws it (measured there: see layoutKeyboard). */
const fingerFont = (size: number): string => `600 ${size}px system-ui, sans-serif`;
/** How pale a fingering hint is printed, as on the staff. */
const HINT_ALPHA = 0.6;
/** …with this many white keys to spare at the edge, unless it was scrolled by hand (see following.ts). */
const FOLLOW_MARGIN_KEYS = 1;

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
  private keys = new Map<number, KeyRect>();
  /** One size for every finger: the largest whose figure fits across the narrowest tile (a black key's). */
  private fingerSize = FINGER_PX;
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
    this.drawn = null;
  }

  /**
   * The moment of the music at height `clientY` over the falling notes, or null over the keyboard.
   * A click on or just beside the bottom of a note means that note: it snaps to the note's start.
   */
  noteAt(clientX: number, clientY: number): number | null {
    const frame = this.lastFrame;
    if (!frame) return null;
    const { score, position, rollHeight, pxPerSecond } = frame;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left + this.scrollX;
    const y = clientY - rect.top;
    if (y < 0 || y > rollHeight) return null;
    const time = position + (rollHeight - y) / pxPerSecond;
    const snap = TILE_SNAP_PX / pxPerSecond;
    // The tile nearest across, of those the press is on: a black key's tile stands over its neighbours'.
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let i = firstNoteAtOrAfter(score, time - snap - this.longestNote); i < score.notes.length; i++) {
      const note = score.notes[i]!;
      if (note.start > time + snap) break;
      const key = this.keys.get(note.pitch);
      if (!key || noteEnd(note) < time - snap) continue;
      const distance = Math.abs(x - (key.x + key.width / 2));
      if (distance > key.width / 2 + TILE_SNAP_PX) continue;
      if (distance < bestDistance || (distance === bestDistance && key.black)) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

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
    if (shown.position !== frame.position && playing >= 0 && playing <= rollHeight - 2) {
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
    this.fingerSize = Math.min(FINGER_PX, (Math.min(...[...this.keys.values()].map((key) => key.width)) - 2) / this.digitWidth());
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
    // A tile is as long as its note is written: a repeated note's tiles touch. (That the finger
    // leaves the key between them is shown on the keyboard: see soundingAt.)
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
      if (frame.picked?.includes(i)) this.drawPicked(key.x + inset, top, key.width - inset * 2, bottom - top);
      ctx.globalAlpha = enabled ? 1 : MUTED_ALPHA;
      ctx.fillStyle = this.colors.hand[note.hand];
      ctx.beginPath();
      ctx.roundRect(key.x + inset, top, key.width - inset * 2, Math.max(2, bottom - top), 4);
      ctx.fill();
      const finger = frame.fingers?.[i];
      if (finger) this.drawFinger(finger, key, top, bottom, enabled);
    }
    ctx.globalAlpha = 1;
  }

  /** How wide the widest figure of a finger is, for its height, in the face this system draws. */
  private digitWidth(): number {
    const { ctx } = this;
    ctx.font = fingerFont(100);
    return Math.max(...['1', '2', '3', '4', '5'].map((figure) => ctx.measureText(figure).width)) / 100;
  }

  /** The note being given a finger: a ring round its tile, as the staff rings its head. */
  private drawPicked(x: number, top: number, width: number, height: number): void {
    const { ctx } = this;
    // (Its pen is its own: the keys' borders are drawn after, with the pen as it is left.)
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.colors.loopEdge;
    ctx.lineWidth = PICKED_RING_PX;
    ctx.beginPath();
    ctx.roundRect(x - PICKED_RING_PX, top - PICKED_RING_PX, width + PICKED_RING_PX * 2, Math.max(2, height) + PICKED_RING_PX * 2, 4 + PICKED_RING_PX);
    ctx.stroke();
    ctx.restore();
  }

  /** A finger on its tile, at the end that comes to the key first; a hint paler, as on the staff. */
  private drawFinger(finger: Fingering, key: KeyRect, top: number, bottom: number, enabled: boolean): void {
    const { ctx } = this;
    const size = this.fingerSize;
    // (Only where it can be read: on keys wide enough for a figure, on a tile long enough for it.)
    if (size < MIN_FINGER_PX || bottom - top < size + 4) return;
    ctx.globalAlpha = (enabled ? 1 : MUTED_ALPHA) * (finger.hint ? HINT_ALPHA : 1);
    ctx.fillStyle = this.colors.whiteKey;
    ctx.font = fingerFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(finger.text, key.x + key.width / 2, bottom - 2);
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
