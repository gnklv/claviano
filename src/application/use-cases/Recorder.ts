import { scoreFromTake, type PlayedNote } from '../../domain/notation/recording';
import type { Score } from '../../domain/score';
import type { AudioOutput } from '../ports/AudioOutput';
import type { Ticker } from '../ports/Ticker';
import type { FreePlay } from './FreePlay';

/** The time signatures to record in: how many beats to the bar, and what a beat is, in quarter notes. */
export const METERS = {
  '2/4': { numerator: 2, denominator: 4, beats: 2, beat: 1 },
  '3/4': { numerator: 3, denominator: 4, beats: 3, beat: 1 },
  '4/4': { numerator: 4, denominator: 4, beats: 4, beat: 1 },
  // (Two beats of three eighths each: the metronome counts the beats, not the eighths.)
  '6/8': { numerator: 6, denominator: 8, beats: 2, beat: 1.5 },
} as const;
export type Meter = keyof typeof METERS;

/** The metronome's tempo, in beats a minute. */
export const RECORDING_TEMPO = { min: 40, max: 200, step: 4, start: 80 } as const;

/** What was recorded: the notes, how long it ran, and the beat it was played to (if it was). */
export interface Take {
  readonly notes: readonly PlayedNote[];
  readonly seconds: number;
  readonly tempo: number;
  readonly meter: Meter;
  /** Played to the metronome: the bars are where the clicks were. Without it they are a guess. */
  readonly onTheBeat: boolean;
}

/**
 * Not recording; waiting for the first note; recording; a take is there, to keep or to throw away.
 */
export type RecorderState = 'idle' | 'armed' | 'recording' | 'recorded';

/**
 * Clicks are handed to the output this far ahead, in seconds: the ticker is not exact, the output's
 * clock is. No further than it takes: a click handed out sounds, whatever is stopped meanwhile.
 */
const AHEAD = 0.12;
/** A first note this much of a beat before a bar line is taken for that bar's: played a touch early. */
const EARLY = 0.2;

/**
 * Recording what is played. It begins with the first note, not with the button: no empty bars to
 * sit through at the start. With the metronome on, the clicks start at once (to come in on), and
 * the take begins at the bar line of the bar the first note falls in: its bars are the metronome's.
 */
export class Recorder {
  private current: RecorderState = 'idle';
  private bpm: number = RECORDING_TEMPO.start;
  private signature: Meter = '4/4';
  private clicking = true;
  /** The take: when it began on the output's clock, and its notes (open ones by pitch). */
  private origin = 0;
  private notes: PlayedNote[] = [];
  private length = 0;
  /** The metronome: when its first click was, how many are handed out, and how to stop it. */
  private firstClick = 0;
  private clicked = 0;
  private stopClicks: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    freePlay: FreePlay,
    private readonly audio: AudioOutput,
    private readonly ticker: Ticker,
  ) {
    freePlay.onKey((pitch, down, at) => (down ? this.keyDown(pitch, at) : this.keyUp(pitch, at)));
  }

  get state(): RecorderState {
    return this.current;
  }

  get tempo(): number {
    return this.bpm;
  }

  get meter(): Meter {
    return this.signature;
  }

  get metronome(): boolean {
    return this.clicking;
  }

  /** The take so far (while recording) or as it was left; null when there is none. */
  get take(): Take | null {
    if (this.current !== 'recording' && this.current !== 'recorded') return null;
    return { notes: this.notes, seconds: this.current === 'recording' ? this.audio.now() - this.origin : this.length, tempo: this.bpm, meter: this.signature, onTheBeat: this.clicking };
  }

  /** The take written down as a piece (as far as it has got, while recording); null when there is none. */
  score(title: string): Score | null {
    const take = this.take;
    const { numerator, denominator, beat } = METERS[this.signature];
    return take && scoreFromTake(title, take.notes, { tempo: this.bpm, numerator, denominator, beat }, take.seconds);
  }

  /** The bar the take is in now, from 1; null when not recording to the metronome. */
  get bar(): number | null {
    if (this.current !== 'recording' || !this.clicking) return null;
    return Math.floor((this.audio.now() - this.origin) / this.barSeconds()) + 1;
  }

  /** Called when the state, the settings or the notes change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The tempo, the time signature and the metronome are set before recording, not during it. */
  setTempo(bpm: number): void {
    if (this.busy()) return;
    this.bpm = Math.min(RECORDING_TEMPO.max, Math.max(RECORDING_TEMPO.min, Math.round(bpm)));
    this.emit();
  }

  setMeter(meter: Meter): void {
    if (this.busy()) return;
    this.signature = meter;
    this.emit();
  }

  setMetronome(on: boolean): void {
    if (this.busy()) return;
    this.clicking = on;
    this.emit();
  }

  /** Ready to record: the next note begins the take. (A take that is there is thrown away.) */
  arm(): void {
    if (this.busy()) return;
    this.notes = [];
    this.current = 'armed';
    if (this.clicking) this.startClicks();
    this.emit();
  }

  /** Ends the take (keys still down come up with it); armed and nothing played, there is no take. */
  stop(): void {
    if (!this.busy()) return;
    this.stopClicks?.();
    this.stopClicks = null;
    if (this.current === 'armed') {
      this.current = 'idle';
    } else {
      this.length = this.audio.now() - this.origin;
      this.notes = this.notes.map((note) => (note.end === null ? { ...note, end: this.length } : note));
      this.current = 'recorded';
    }
    this.emit();
  }

  /** Throws the take away. */
  discard(): void {
    if (this.current !== 'recorded') return;
    this.notes = [];
    this.current = 'idle';
    this.emit();
  }

  private busy(): boolean {
    return this.current === 'armed' || this.current === 'recording';
  }

  private beatSeconds(): number {
    return 60 / this.bpm;
  }

  private barSeconds(): number {
    return this.beatSeconds() * METERS[this.signature].beats;
  }

  private keyDown(pitch: number, at: number): void {
    if (this.current === 'armed') {
      this.origin = this.clicking ? this.barLineFor(at) : at;
      this.current = 'recording';
    }
    if (this.current !== 'recording') return;
    this.notes = [...this.notes, { pitch, start: Math.max(0, at - this.origin), end: null }];
    this.emit();
  }

  private keyUp(pitch: number, at: number): void {
    if (this.current !== 'recording') return;
    // (The last note of this key still open: the one this key-up ends.)
    const index = this.notes.map((note) => note.pitch === pitch && note.end === null).lastIndexOf(true);
    if (index < 0) return;
    this.notes = this.notes.map((note, i) => (i === index ? { ...note, end: at - this.origin } : note));
    this.emit();
  }

  /** The metronome's bar line that a first note at `at` belongs to: the one before it, or the next when it is all but there. */
  private barLineFor(at: number): number {
    const bars = (at - this.firstClick + EARLY * this.beatSeconds()) / this.barSeconds();
    return this.firstClick + Math.max(0, Math.floor(bars)) * this.barSeconds();
  }

  private startClicks(): void {
    // (A moment from now: the first click whole, not cut by being asked for late.)
    this.firstClick = this.audio.now() + 0.1;
    this.clicked = 0;
    const hand = () => {
      const until = this.audio.now() + AHEAD;
      for (let at = this.firstClick + this.clicked * this.beatSeconds(); at < until; at = this.firstClick + this.clicked * this.beatSeconds()) {
        this.audio.playClick(at, this.clicked % METERS[this.signature].beats === 0);
        this.clicked++;
      }
    };
    void this.audio.resume();
    hand();
    this.stopClicks = this.ticker.start(hand);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
