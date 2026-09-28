import { HANDS, type Hand } from '../../domain/note';
import { soundingDurations } from '../../domain/pedal';
import { firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import type { AudioOutput } from '../ports/AudioOutput';
import type { Ticker } from '../ports/Ticker';

/** How far ahead of the audio clock notes are handed to the output, in seconds. */
const LOOKAHEAD = 0.2;
const MIN_LOOP_LENGTH = 0.1;
export const MIN_TEMPO = 0.1;
export const MAX_TEMPO = 2;

/** Maps audio time to score time: score = anchor.score + (audio - anchor.audio) * tempo. */
interface Anchor {
  readonly audio: number;
  readonly score: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Plays a score through an AudioOutput with tempo, per-hand muting, looping and the sustain pedal.
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
  /** How long each note of the score sounds with the pedal (same indices as its notes). */
  private sustained: number[] = [];

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

  /** Whether the score's sustain pedal is played. Off, every note stops when its key is released. */
  get pedalEnabled(): boolean {
    return this.pedalOn;
  }

  /** Current position in score seconds. Cheap enough to read every animation frame. */
  get position(): number {
    if (!this.isPlaying) return this.anchor.score;
    const now = this.audio.now();
    while (this.pendingWraps.length > 0 && now >= this.pendingWraps[0].audio) {
      this.anchor = this.pendingWraps.shift()!;
    }
    const position = this.anchor.score + (now - this.anchor.audio) * this.currentTempo;
    return Math.min(position, this.currentScore?.duration ?? 0);
  }

  /** Subscribes to state changes (play/pause, tempo, loop, hands, score). Not called per frame. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(score: Score): void {
    this.pause();
    this.currentScore = score;
    this.sustained = soundingDurations(score.notes, score.pedal);
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
    this.restartFrom(from >= range.start && from < range.end ? from : range.start);
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

  private restartFrom(position: number): void {
    const score = this.currentScore!;
    this.anchor = { audio: this.audio.now(), score: position };
    this.pendingWraps = [];
    this.scheduleAnchor = this.anchor;
    this.nextNoteIndex = firstNoteAtOrAfter(score, position);
    this.schedule(score);
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
        this.audio.playNote(note.pitch, note.velocity, this.toAudio(note.start), duration / this.currentTempo);
      }
      if (!this.currentLoop || horizon < segmentEnd) return;

      // The horizon crosses the loop end: continue scheduling from the loop start seamlessly.
      const wrap = { audio: this.toAudio(segmentEnd), score: this.currentLoop.start };
      this.pendingWraps.push(wrap);
      this.scheduleAnchor = wrap;
      this.nextNoteIndex = firstNoteAtOrAfter(score, wrap.score);
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
