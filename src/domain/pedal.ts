import { noteEnd, type Note } from './note';

/*
 * The sustain (damper) pedal. While it is down, released keys keep sounding until it comes up.
 * Notes keep their own length (how long the finger holds the key); the pedal lives beside them.
 */

/** The pedal held down from `start` to `end`, in seconds as played. Spans are sorted and do not overlap. */
export interface PedalSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * A pedal mark as printed under the lower staff, at `beat` along the page.
 * `start` presses the pedal, `stop` lifts it, `change` lifts and presses again at once.
 */
export interface PedalMark {
  readonly beat: number;
  readonly type: 'start' | 'stop' | 'change';
  /** Printed as the "Ped." and "✱" signs. */
  readonly sign: boolean;
  /** Printed as a bracket line under the notes (with a notch at a change). */
  readonly line: boolean;
}

/** Whether the pedal is down at `time`. */
export function pedalDownAt(pedal: readonly PedalSpan[], time: number): boolean {
  return spanAt(pedal, time) !== undefined;
}

/**
 * How long each note actually sounds, in seconds (same indices as `notes`, which are sorted by start).
 * A key released while the pedal is down sounds on until the pedal comes up. A key released exactly
 * when the pedal goes down is not caught: that is how a pedal change keeps chords apart. Striking
 * the same key again silences what was still sounding of it, as on a real piano.
 */
export function soundingDurations(notes: readonly Note[], pedal: readonly PedalSpan[]): number[] {
  const nextSamePitch = new Map<number, number>(); // pitch → start of the next note of that pitch
  const durations: number[] = new Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const released = noteEnd(note);
    const span = spanAt(pedal, released, true);
    let end = span && span.end > released ? span.end : released;
    const next = nextSamePitch.get(note.pitch);
    if (next !== undefined && next > note.start) end = Math.max(released, Math.min(end, next));
    durations[i] = end - note.start;
    nextSamePitch.set(note.pitch, note.start);
  }
  return durations;
}

/**
 * The span holding the pedal down at `time`. Spans include their start; with `catching` they
 * include their end instead, which is what a released key needs (see soundingDurations).
 */
function spanAt(pedal: readonly PedalSpan[], time: number, catching = false): PedalSpan | undefined {
  let lo = 0;
  let hi = pedal.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const span = pedal[mid];
    const afterStart = catching ? time > span.start : time >= span.start;
    const beforeEnd = catching ? time <= span.end : time < span.end;
    if (!afterStart) hi = mid - 1;
    else if (!beforeEnd) lo = mid + 1;
    else return span;
  }
  return undefined;
}

/**
 * Joins pedal presses and releases into spans. A pedal still down at the end is lifted at `end`.
 * A release and a press at the same moment are a pedal change: the release comes first.
 */
export function pedalSpans(events: readonly { time: number; down: boolean }[], end: number): PedalSpan[] {
  const spans: PedalSpan[] = [];
  let pressedAt: number | null = null;
  for (const event of [...events].sort((a, b) => a.time - b.time || Number(a.down) - Number(b.down))) {
    if (event.down) {
      if (pressedAt === null) pressedAt = event.time;
    } else if (pressedAt !== null) {
      if (event.time > pressedAt) spans.push({ start: pressedAt, end: event.time });
      pressedAt = null;
    }
  }
  if (pressedAt !== null && end > pressedAt) spans.push({ start: pressedAt, end });
  return spans;
}

/** A moment the foot moves: press, release, or a change (release and press again at once). */
export interface PedalEvent {
  readonly time: number;
  readonly kind: 'press' | 'release' | 'change';
}

/**
 * The moments to show a player, in time order. A release followed by a press within `changeGap`
 * seconds is one change: players lift and press again in a flash, and MIDI records that gap.
 */
export function pedalEvents(pedal: readonly PedalSpan[], changeGap = 0): PedalEvent[] {
  const events: PedalEvent[] = [];
  pedal.forEach((span, i) => {
    const previous = pedal[i - 1];
    if (previous && span.start - previous.end <= changeGap) events.push({ time: previous.end, kind: 'change' });
    else events.push({ time: span.start, kind: 'press' });
    const next = pedal[i + 1];
    if (!next || next.start - span.end > changeGap) events.push({ time: span.end, kind: 'release' });
  });
  return events;
}
