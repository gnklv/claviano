import { HANDS, type Hand } from '../../domain/note';
import { pedalDownAt, SOFT_PEDAL_LOUDNESS, soundingDurations } from '../../domain/pedal';
import { firstNoteAtOrAfter, type Score, type TimeRange } from '../../domain/score';
import { firstAtOrAfter } from '../../domain/search';
import type { AudioOutput } from '../ports/AudioOutput';
import type { Ticker } from '../ports/Ticker';
import { AHEAD, handAhead } from './handAhead';
import { Clicks } from './clicks';

const MIN_LOOP_LENGTH = 0.1;
/**
 * Starting in the middle of notes (after a seek, a pause, a tempo change), the notes still sounding
 * there are played for what is left of them, as quiet as a string that has rung for a while; tails
 * shorter than MIN_RESUMED_SECONDS are left out.
 */
const RESUMED_LOUDNESS = 0.6;
const MIN_RESUMED_SECONDS = 0.1;
const MIN_TEMPO = 0.1;
const MAX_TEMPO = 2;

/** Maps audio time to score time: score = anchor.score + (audio - anchor.audio) * tempo. */
interface Anchor {
  readonly audio: number;
  readonly score: number;
}

/** The loop come round: where, and at what tempo its next pass is played. */
interface Wrap extends Anchor {
  readonly tempo: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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
  /** The metronome's clicks and the count-in (see clicks.ts). */
  private readonly clicks: Clicks;
  /** Every move of the sustain pedal in the score (down, up), in order, and the next one to schedule. */
  private pedalMoves: { time: number; down: boolean }[] = [];
  private nextPedalIndex = 0;

  /** What the listener hears right now. When paused, `score` is the paused position. */
  private anchor: Anchor = { audio: 0, score: 0 };
  /** Loop restarts already scheduled but not yet reached by the audio clock. */
  private pendingWraps: Wrap[] = [];
  /** Where the scheduler is, and at what tempo; can be one loop iteration ahead of `anchor`. */
  private scheduleAnchor: Anchor = this.anchor;
  private scheduleTempo = 1;
  /** The tempo the loop's next pass is to be played at (see setTempoAtLoop); null: as this one. */
  private loopTempo: number | null = null;
  /** How many times the loop has come round since playing began. */
  private rounds = 0;
  private nextNoteIndex = 0;

  private stopTicker: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly audio: AudioOutput,
    private readonly ticker: Ticker,
  ) {
    this.clicks = new Clicks(audio);
  }

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
    return this.clicks.metronome;
  }

  /** Whether playing starts with a count-in. */
  get countInEnabled(): boolean {
    return this.clicks.countingIn;
  }

  /** While counting in, the number being counted now ("1", "2"…); null otherwise. */
  get countInBeat(): number | null {
    return this.isPlaying ? this.clicks.countInBeat : null;
  }

  /** The last click heard (metronome or count-in): how many seconds ago, and whether accented. */
  get lastClick(): { age: number; accent: boolean } | null {
    return this.clicks.lastClick;
  }

  /** How many times the loop has come round since playing began: each time, a change is told. */
  get loopRounds(): number {
    return this.rounds;
  }

  /** Current position in score seconds. Cheap enough to read every animation frame. */
  get position(): number {
    if (!this.isPlaying) return this.anchor.score;
    const now = this.audio.now();
    // Counting in: the music waits at its start.
    if (now < this.anchor.audio) return this.anchor.score;
    this.reachWraps(now);
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
    this.longestSounding = score.notes.reduce((max, note, i) => Math.max(max, note.duration, this.sustained[i] ?? 0), 0);
    this.clicks.load(score);
    this.pedalMoves = score.pedal
      .flatMap((span) => [
        { time: span.start, down: true },
        { time: span.end, down: false },
      ])
      // At a pedal change the foot comes up, then goes down.
      .sort((a, b) => a.time - b.time || Number(a.down) - Number(b.down));
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
    this.rounds = 0;
    this.restartFrom(from >= range.start && from < range.end ? from : range.start, this.clicks.countingIn);
    this.stopTicker = handAhead(this.ticker, this.audio, (until) => this.tick(until));
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
    this.clicks.silence();
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
    // (A tempo set by hand stands for the passes to come too.)
    this.loopTempo = null;
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
    if (enabled === this.clicks.metronome) return;
    this.clicks.metronome = enabled;
    this.emit();
  }

  setCountInEnabled(enabled: boolean): void {
    if (enabled === this.clicks.countingIn) return;
    this.clicks.countingIn = enabled;
    this.emit();
  }

  /**
   * The tempo the loop's next pass is played at, from its first note (null: as the one before). It
   * is taken when the loop comes round next, unless that is already on its way to the output.
   */
  setTempoAtLoop(tempo: number | null): void {
    this.loopTempo = tempo === null ? null : clamp(tempo, MIN_TEMPO, MAX_TEMPO);
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
    this.clicks.silence();
    const lead = withCountIn ? this.clicks.countIn(score, position, this.currentTempo) : 0;
    this.anchor = { audio: now + lead, score: position };
    this.pendingWraps = [];
    this.scheduleAnchor = this.anchor;
    this.scheduleTempo = this.currentTempo;
    this.nextNoteIndex = firstNoteAtOrAfter(score, position);
    this.clicks.from(position);
    this.nextPedalIndex = firstAtOrAfter(this.pedalMoves, position, (move) => move.time);
    this.resumeSounding(score, position);
    this.schedule(score);
  }

  /** Plays the notes struck before `position` that still sound there, for the rest of their length. */
  private resumeSounding(score: Score, position: number): void {
    const { notes } = score;
    for (let i = firstNoteAtOrAfter(score, position - this.longestSounding); i < notes.length; i++) {
      const note = notes[i]!;
      if (note.start >= position) break;
      if (!this.enabledHands.has(note.hand)) continue;
      const end = note.start + (this.pedalOn ? (this.sustained[i] ?? note.duration) : note.duration);
      const left = Math.min(end, this.currentLoop?.end ?? end) - position;
      if (left < MIN_RESUMED_SECONDS) continue;
      const soft = this.pedalOn && (this.softened[i] ?? false);
      const velocity = (soft ? note.velocity * SOFT_PEDAL_LOUDNESS : note.velocity) * RESUMED_LOUDNESS;
      // The key may be up already, the pedal alone holding the note.
      const held = Math.min(left, Math.max(0, note.start + note.duration - position));
      this.audio.playNote({
        pitch: note.pitch,
        velocity,
        at: this.toAudio(position),
        duration: left / this.scheduleTempo,
        soft,
        held: held / this.scheduleTempo,
      });
    }
  }

  private tick(until: number): void {
    const score = this.currentScore;
    if (!score || !this.isPlaying) return;
    this.reachWraps(this.audio.now());
    if (!this.currentLoop && this.position >= score.duration) {
      this.halt(false);
      return;
    }
    this.schedule(score, until);
  }

  /** Hands the output what is due up to `until` on its clock (see handAhead). */
  private schedule(score: Score, until = this.audio.now() + AHEAD): void {
    const { notes } = score;
    const horizonAudio = until;
    for (;;) {
      const segmentEnd = this.currentLoop?.end ?? score.duration;
      const horizon = Math.min(this.toScore(horizonAudio), segmentEnd);
      while (this.nextNoteIndex < notes.length && notes[this.nextNoteIndex]!.start < horizon) {
        const index = this.nextNoteIndex++;
        const note = notes[index]!;
        if (!this.enabledHands.has(note.hand)) continue;
        const sounding = this.pedalOn ? (this.sustained[index] ?? note.duration) : note.duration;
        // A loop cuts what would sound past its end; the end of the piece lets it ring (the last pedalled chord).
        const duration = this.currentLoop ? Math.min(sounding, segmentEnd - note.start) : sounding;
        const soft = this.pedalOn && (this.softened[index] ?? false);
        const velocity = soft ? note.velocity * SOFT_PEDAL_LOUDNESS : note.velocity;
        const held = Math.min(note.duration, duration);
        this.audio.playNote({
          pitch: note.pitch,
          velocity,
          at: this.toAudio(note.start),
          duration: duration / this.scheduleTempo,
          soft,
          held: held / this.scheduleTempo,
        });
      }
      // As with the clicks: the index moves on even with the pedal off. The pedal coming up at the
      // end of the piece or after its last note is heard too, like the last chord ringing on.
      const ending = !this.currentLoop && horizon >= score.duration;
      const pedalDue = (time: number) => time < horizon || ending;
      while (this.nextPedalIndex < this.pedalMoves.length && pedalDue(this.pedalMoves[this.nextPedalIndex]!.time)) {
        const move = this.pedalMoves[this.nextPedalIndex++]!;
        if (this.pedalOn) this.audio.playPedal(this.toAudio(move.time), move.down);
      }
      this.clicks.due(horizon, this.scheduleAnchor, this.scheduleTempo);
      if (!this.currentLoop || horizon < segmentEnd) return;

      // The horizon crosses the loop end: continue scheduling from the loop start seamlessly.
      const wrap = { audio: this.toAudio(segmentEnd), score: this.currentLoop.start, tempo: this.loopTempo ?? this.scheduleTempo };
      this.loopTempo = null;
      this.pendingWraps.push(wrap);
      this.scheduleAnchor = wrap;
      this.scheduleTempo = wrap.tempo;
      this.nextNoteIndex = firstNoteAtOrAfter(score, wrap.score);
      this.clicks.from(wrap.score);
      this.nextPedalIndex = firstAtOrAfter(this.pedalMoves, wrap.score, (move) => move.time);
    }
  }

  private toAudio(scoreTime: number): number {
    return this.scheduleAnchor.audio + (scoreTime - this.scheduleAnchor.score) / this.scheduleTempo;
  }

  private toScore(audioTime: number): number {
    return this.scheduleAnchor.score + (audioTime - this.scheduleAnchor.audio) * this.scheduleTempo;
  }

  /**
   * The audio clock has reached the loop's restarts scheduled before `now`: what is heard goes on
   * from there, at the tempo of the pass. Told as a change, after what reads the position has done.
   */
  private reachWraps(now: number): void {
    let reached = false;
    for (let next = this.pendingWraps[0]; next && now >= next.audio; next = this.pendingWraps[0]) {
      this.anchor = next;
      this.currentTempo = next.tempo;
      this.pendingWraps.shift();
      this.rounds++;
      reached = true;
    }
    if (reached) queueMicrotask(() => this.emit());
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
