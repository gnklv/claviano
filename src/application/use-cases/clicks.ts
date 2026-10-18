import { countIn, metronomeClicks, type Click } from '../../domain/metronome';
import { SAME_MOMENT } from '../../domain/moment';
import type { Score } from '../../domain/score';
import { firstAtOrAfter } from '../../domain/search';
import type { AudioOutput } from '../ports/AudioOutput';

/*
 * The clicks of playback: the metronome's, on every beat of the piece, and the count-in before the
 * music comes in. Playback says when (its one scheduler hands them over with the notes, on the
 * same clock); this knows which are due, keeps what was handed over, and tells the count being
 * counted and the last click heard (for the beat to be shown).
 */

/** A click handed to the output, in audio time. */
interface SoundedClick {
  readonly at: number;
  readonly accent: boolean;
}

/** Where the scheduler is: audio time = anchor.audio + (score time − anchor.score) / tempo. */
export interface ScheduleAnchor {
  readonly audio: number;
  readonly score: number;
}

export class Clicks {
  /** Whether the metronome clicks along. */
  metronome = false;
  /** Whether playing starts with a count-in. */
  countingIn = false;
  /** Every metronome click of the piece, and the next one due. */
  private clicks: Click[] = [];
  private next = 0;
  /** The count-in in progress: its clicks' audio times and the numbers counted, and when the music comes in. */
  private counting: { times: number[]; counts: number[]; end: number } | null = null;
  /** Clicks recently handed to the output, oldest first. */
  private sounded: SoundedClick[] = [];

  constructor(private readonly audio: AudioOutput) {}

  /** A piece to click along. */
  load(score: Score): void {
    this.clicks = metronomeClicks(score);
  }

  /** Nothing counted, nothing heard: playing has stopped, or starts afresh. */
  silence(): void {
    this.counting = null;
    this.sounded = [];
  }

  /**
   * Counts in, now, before the music at `position` (seconds) played at `tempo`: hands the count to
   * the output and returns how long it lasts, in audio seconds (when the music comes in).
   */
  countIn(score: Score, position: number, tempo: number): number {
    const now = this.audio.now();
    const clicks = countIn(score, position);
    const lead = Math.max(0, ...clicks.map((click) => click.before)) / tempo;
    const times = clicks.map((click) => now + lead - click.before / tempo);
    clicks.forEach((click, i) => this.click(times[i]!, click.count === 1));
    this.counting = { times, counts: clicks.map((click) => click.count), end: now + lead };
    return lead;
  }

  /** The music goes on from `position` (seconds): a start, or a loop come round. */
  from(position: number): void {
    this.next = firstAtOrAfter(this.clicks, position - SAME_MOMENT, timeOf);
  }

  /**
   * Hands the output the metronome's clicks due before `horizon` (seconds), placed by `anchor` and
   * `tempo`. The clicks are passed even with the metronome off, so switching it on joins in at the
   * right beat.
   */
  due(horizon: number, anchor: ScheduleAnchor, tempo: number): void {
    while (this.next < this.clicks.length && this.clicks[this.next]!.time < horizon) {
      const click = this.clicks[this.next++]!;
      if (this.metronome) this.click(anchor.audio + (click.time - anchor.score) / tempo, click.accent);
    }
  }

  /** While counting in, the number being counted now ("1", "2"…); null otherwise. */
  get countInBeat(): number | null {
    const counting = this.counting;
    if (!counting) return null;
    const now = this.audio.now();
    if (now >= counting.end) return null;
    let current: number | null = null;
    counting.times.forEach((at, i) => {
      if (at <= now) current = counting.counts[i] ?? null;
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

  private click(at: number, accent: boolean): void {
    this.audio.playClick(at, accent);
    const now = this.audio.now();
    // Keep only what can still be the last click heard.
    while (this.sounded.length > 1 && this.sounded[1]!.at <= now) this.sounded.shift();
    this.sounded.push({ at, accent });
  }
}

const timeOf = (click: Click): number => click.time;
