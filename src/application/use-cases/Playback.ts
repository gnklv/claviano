import { countIn, metronomeClicks, type Click } from '../../domain/metronome';
import { HANDS, type Hand } from '../../domain/note';
import { pedalDownAt, SOFT_PEDAL_LOUDNESS, soundingDurations } from '../../domain/pedal';
import { firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import type { AudioOutput } from '../ports/AudioOutput';
import type { Ticker } from '../ports/Ticker';

/** How far ahead of the audio clock notes are handed to the output, in seconds. */
const LOOKAHEAD = 0.2;
const MIN_LOOP_LENGTH = 0.1;
/**
 * Starting in the middle of notes (after a seek, a pause, a tempo change), the notes still sounding
 * there are played for what is left of them, as quiet as a string that has rung for a while; tails
 * shorter than MIN_RESUMED_SECONDS are left out.
 */
const RESUMED_LOUDNESS = 0.6;
const MIN_RESUMED_SECONDS = 0.1;
export const MIN_TEMPO = 0.1;
export const MAX_TEMPO = 2;

/** Maps audio time to score time: score = anchor.score + (audio - anchor.audio) * tempo. */
interface Anchor {
  readonly audio: number;
  readonly score: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** A click handed to the output, in audio time: for showing the beat. */
interface SoundedClick {
  readonly at: number;
  readonly accent: boolean;
}

/** Index of the first click at or after `time` (clicks are sorted). */
function firstClickAtOrAfter(clicks: readonly Click[], time: number): number {
  let lo = 0;
  let hi = clicks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (clicks[mid].time < time - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Plays a score through an AudioOutput with tempo, per-hand muting, looping, the pedals,
 * a metronome and a count-in.
 *
 * Notes are scheduled slightly ahead of time on the audio clock (the "two clocks" pattern),
 * so timing does not depend on how regularly the ticker fires.
 */
export class Playback {
  private currentScore: Score | null = null;
  private isPlaying = false;
  private currentTempo = 1;
  private currentLoop: TimeRange | null = null;
  private readonly enabledHands = new Set<Hand>(HANDS);
  private pedalOn = true;
  /** How long each note of the score sounds with the pedals (same indices as its notes). */
  private sustained: number[] = [];
  /** Which notes are struck with the soft pedal down (same indices as its notes). */
  private softened: boolean[] = [];
  /** The longest a note of the score sounds, pedals included: how far back a note can still be heard. */
  private longestSounding = 0;
  private metronomeOn = false;
  private countInOn = false;
  /** Every metronome click of the score, and the next one to schedule. */
  private clicks: Click[] = [];
  private nextClickIndex = 0;
  /** The count-in in progress: its clicks' audio times and the numbers counted, and when the music comes in. */
  private counting: { times: number[]; counts: number[]; end: number } | null = null;
  /** Clicks recently handed to the output, oldest first. */
  private sounded: SoundedClick[] = [];

  /** What the listener hears right now. When paused, `score` is the paused position. */
  private anchor: Anchor = { audio: 0, score: 0 };
  /** Loop restarts already scheduled but not yet reached by the audio clock. */
  private pendingWraps: Anchor[] = [];
  /** Where the scheduler is; can be one loop iteration ahead of `anchor`. */
  private scheduleAnchor: Anchor = this.anchor;
  private nextNoteIndex = 0;

  private stopTicker: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly audio: AudioOutput,
    private readonly ticker: Ticker,
  ) {}

  get score(): Score | null {
    return this.currentScore;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get tempo(): number {
    return this.currentTempo;
  }

  get loop(): TimeRange | null {
    return this.currentLoop;
  }

  isHandEnabled(hand: Hand): boolean {
    return this.enabledHands.has(hand);
  }

  /** Whether the score's pedals are played. Off, every note stops when its key is released. */
  get pedalEnabled(): boolean {
    return this.pedalOn;
  }

  get metronomeEnabled(): boolean {
    return this.metronomeOn;
  }

  /** Whether playing starts with a count-in. */
  get countInEnabled(): boolean {
    return this.countInOn;
  }

  /** While counting in, the number being counted now ("1", "2"…); null otherwise. */
  get countInBeat(): number | null {
    const counting = this.counting;
    if (!counting || !this.isPlaying) return null;
    const now = this.audio.now();
    if (now >= counting.end) return null;
    let current: number | null = null;
    counting.times.forEach((at, i) => {
      if (at <= now) current = counting.counts[i];
    });
    return current;
  }

  /** The last click heard (metronome or count-in): how many seconds ago, and whether accented. */
  get lastClick(): { age: number; accent: boolean } | null {
    const now = this.audio.now();
    let last: SoundedClick | undefined;
    for (const click of this.sounded) {
      if (click.at > now) break;
      last = click;
    }
    return last ? { age: now - last.at, accent: last.accent } : null;
  }

  /** Current position in score seconds. Cheap enough to read every animation frame. */
  get position(): number {
    if (!this.isPlaying) return this.anchor.score;
    const now = this.audio.now();
    // Counting in: the music waits at its start.
    if (now < this.anchor.audio) return this.anchor.score;
    while (this.pendingWraps.length > 0 && now >= this.pendingWraps[0].audio) {
      this.anchor = this.pendingWraps.shift()!;
    }
    const position = this.anchor.score + (now - this.anchor.audio) * this.currentTempo;
    return Math.min(position, this.currentScore?.duration ?? 0);
  }

  /** Subscribes to state changes (play/pause, tempo, loop, hands, pedals, metronome, score). Not called per frame. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(score: Score): void {
    this.pause();
    this.currentScore = score;
    this.sustained = soundingDurations(score.notes, score.pedal, score.sostenutoPedal);
    this.softened = score.notes.map((note) => pedalDownAt(score.softPedal, note.start));
    this.longestSounding = score.notes.reduce((max, note, i) => Math.max(max, note.duration, this.sustained[i]), 0);
    this.clicks = metronomeClicks(score);
    this.currentLoop = null;
    this.anchor = { audio: 0, score: 0 };
    this.emit();
  }

  async play(): Promise<void> {
    if (!this.currentScore || this.isPlaying) return;
    await this.audio.resume();
    const score = this.currentScore;
    if (!score || this.isPlaying) return;

    const range = this.playRange(score);
    const from = this.anchor.score;
    this.isPlaying = true;
    this.restartFrom(from >= range.start && from < range.end ? from : range.start, this.countInOn);
    this.stopTicker = this.ticker.start(() => this.tick());
    this.emit();
  }

  pause(): void {
    this.halt(true);
  }

  /** Stops playing; `silence` also cuts what is still sounding (a finished piece rings out instead). */
  private halt(silence: boolean): void {
    if (!this.isPlaying) return;
    const position = this.position;
    this.isPlaying = false;
    this.stopTicker?.();
    this.stopTicker = null;
    if (silence) this.audio.stopAll();
    this.pendingWraps = [];
    this.counting = null;
    this.sounded = [];
    this.anchor = { audio: 0, score: position };
    this.emit();
  }

  stop(): void {
    this.pause();
    this.anchor = { audio: 0, score: this.currentLoop?.start ?? 0 };
    this.emit();
  }

  seek(time: number): void {
    const score = this.currentScore;
    if (!score) return;
    const range = this.playRange(score);
    const target = clamp(time, range.start, range.end);
    if (this.isPlaying) {
      this.audio.stopAll();
      this.restartFrom(target);
    } else {
      this.anchor = { audio: 0, score: target };
    }
    this.emit();
  }

  setTempo(tempo: number): void {
    const next = clamp(tempo, MIN_TEMPO, MAX_TEMPO);
    if (next === this.currentTempo) return;
    if (this.isPlaying) {
      const position = this.position;
      this.currentTempo = next;
      this.audio.stopAll();
      this.restartFrom(position);
    } else {
      this.currentTempo = next;
    }
    this.emit();
  }

  /** Muted hands are still shown by the view, just not played. */
  setHandEnabled(hand: Hand, enabled: boolean): void {
    if (enabled) this.enabledHands.add(hand);
    else this.enabledHands.delete(hand);
    this.emit();
  }

  setPedalEnabled(enabled: boolean): void {
    if (enabled === this.pedalOn) return;
    this.pedalOn = enabled;
    // Notes already handed to the output keep their old length; reschedule them.
    if (this.isPlaying) {
      const position = this.position;
      this.audio.stopAll();
      this.restartFrom(position);
    }
    this.emit();
  }

  /** Clicks already handed to the output still sound; the change applies from the next one. */
  setMetronomeEnabled(enabled: boolean): void {
    if (enabled === this.metronomeOn) return;
    this.metronomeOn = enabled;
    this.emit();
  }

  setCountInEnabled(enabled: boolean): void {
    if (enabled === this.countInOn) return;
    this.countInOn = enabled;
    this.emit();
  }

  setLoop(range: TimeRange | null): void {
    const score = this.currentScore;
    if (!score) return;
    this.currentLoop =
      range && range.end - range.start >= MIN_LOOP_LENGTH
        ? { start: clamp(range.start, 0, score.duration), end: clamp(range.end, 0, score.duration) }
        : null;

    const bounds = this.playRange(score);
    const position = this.position;
    const inside = position >= bounds.start && position < bounds.end;
    if (this.isPlaying) {
      this.audio.stopAll();
      this.restartFrom(inside ? position : bounds.start);
    } else if (!inside) {
      this.anchor = { audio: 0, score: bounds.start };
    }
    this.emit();
  }

  private playRange(score: Score): TimeRange {
    return this.currentLoop ?? { start: 0, end: score.duration };
  }

  /** Starts sounding from `position` now, or after a count-in. */
  private restartFrom(position: number, withCountIn = false): void {
    const score = this.currentScore!;
    const now = this.audio.now();
    this.counting = null;
    this.sounded = [];
    let lead = 0;
    if (withCountIn) {
      const clicks = countIn(score, position);
      lead = Math.max(0, ...clicks.map((c) => c.before)) / this.currentTempo;
      const times = clicks.map((c) => now + lead - c.before / this.currentTempo);
      clicks.forEach((c, i) => this.click(times[i], c.count === 1));
      this.counting = { times, counts: clicks.map((c) => c.count), end: now + lead };
    }
    this.anchor = { audio: now + lead, score: position };
    this.pendingWraps = [];
    this.scheduleAnchor = this.anchor;
    this.nextNoteIndex = firstNoteAtOrAfter(score, position);
    this.nextClickIndex = firstClickAtOrAfter(this.clicks, position);
    this.resumeSounding(score, position);
    this.schedule(score);
  }

  /** Plays the notes struck before `position` that still sound there, for the rest of their length. */
  private resumeSounding(score: Score, position: number): void {
    const { notes } = score;
    for (let i = firstNoteAtOrAfter(score, position - this.longestSounding); i < notes.length; i++) {
      const note = notes[i];
      if (note.start >= position) break;
      if (!this.enabledHands.has(note.hand)) continue;
      const end = note.start + (this.pedalOn ? this.sustained[i] : note.duration);
      const left = Math.min(end, this.currentLoop?.end ?? end) - position;
      if (left < MIN_RESUMED_SECONDS) continue;
      const soft = this.pedalOn && this.softened[i];
      const velocity = (soft ? note.velocity * SOFT_PEDAL_LOUDNESS : note.velocity) * RESUMED_LOUDNESS;
      this.audio.playNote(note.pitch, velocity, this.toAudio(position), left / this.currentTempo, soft);
    }
  }

  private click(at: number, accent: boolean): void {
    this.audio.playClick(at, accent);
    const now = this.audio.now();
    // Keep only what can still be the last click heard.
    while (this.sounded.length > 1 && this.sounded[1].at <= now) this.sounded.shift();
    this.sounded.push({ at, accent });
  }

  private tick(): void {
    const score = this.currentScore;
    if (!score || !this.isPlaying) return;
    if (!this.currentLoop && this.position >= score.duration) {
      this.halt(false);
      return;
    }
    this.schedule(score);
  }

  private schedule(score: Score): void {
    const { notes } = score;
    const horizonAudio = this.audio.now() + LOOKAHEAD;
    for (;;) {
      const segmentEnd = this.currentLoop?.end ?? score.duration;
      const horizon = Math.min(this.toScore(horizonAudio), segmentEnd);
      while (this.nextNoteIndex < notes.length && notes[this.nextNoteIndex].start < horizon) {
        const index = this.nextNoteIndex++;
        const note = notes[index];
        if (!this.enabledHands.has(note.hand)) continue;
        const sounding = this.pedalOn ? this.sustained[index] : note.duration;
        // A loop cuts what would sound past its end; the end of the piece lets it ring (the last pedalled chord).
        const duration = this.currentLoop ? Math.min(sounding, segmentEnd - note.start) : sounding;
        const soft = this.pedalOn && this.softened[index];
        const velocity = soft ? note.velocity * SOFT_PEDAL_LOUDNESS : note.velocity;
        this.audio.playNote(note.pitch, velocity, this.toAudio(note.start), duration / this.currentTempo, soft);
      }
      // The index moves on even with the metronome off, so switching it on joins in at the right beat.
      while (this.nextClickIndex < this.clicks.length && this.clicks[this.nextClickIndex].time < horizon) {
        const click = this.clicks[this.nextClickIndex++];
        if (this.metronomeOn) this.click(this.toAudio(click.time), click.accent);
      }
      if (!this.currentLoop || horizon < segmentEnd) return;

      // The horizon crosses the loop end: continue scheduling from the loop start seamlessly.
      const wrap = { audio: this.toAudio(segmentEnd), score: this.currentLoop.start };
      this.pendingWraps.push(wrap);
      this.scheduleAnchor = wrap;
      this.nextNoteIndex = firstNoteAtOrAfter(score, wrap.score);
      this.nextClickIndex = firstClickAtOrAfter(this.clicks, wrap.score);
    }
  }

  private toAudio(scoreTime: number): number {
    return this.scheduleAnchor.audio + (scoreTime - this.scheduleAnchor.score) / this.currentTempo;
  }

  private toScore(audioTime: number): number {
    return this.scheduleAnchor.score + (audioTime - this.scheduleAnchor.audio) * this.currentTempo;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
