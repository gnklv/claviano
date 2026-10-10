import { lastAtOrBefore } from '../search';
import type { Notation, TempoChange } from './notation';

/*
 * Changes of pace written in words: "rit." and "rall." (slowing down), "riten." (held back),
 * "accel." (speeding up), "a tempo" and "Tempo I" (back to the pace before, or to the first one).
 *
 * The page says only that the music slows down, not by how much or how; a pianist decides. Played
 * here in the shape players were found to give it (Friberg and Sundberg, 1999: a final ritardando
 * runs like a runner coming to a stop): hardly at first, then more and more, the slowest at the
 * last note. How far down depends on where it stands: to seven tenths of the pace at the end of a
 * piece, less in the middle of one, where it is a breath between phrases. (The study's endings,
 * of Baroque pieces, go down to half; for songs and lyrical piano music that is too much: chosen
 * by ear on the pieces at hand.)
 */

export type PaceChange = 'slower' | 'held' | 'faster' | 'back' | 'first';

/** The change of pace words ask for, if any; `slight` for "poco rit.". */
export function paceWords(text: string): { kind: PaceChange; slight: boolean } | null {
  const kind: PaceChange | null = /\btempo\s+(i|1|primo)\b/i.test(text)
    ? 'first'
    : /\ba\s+tempo\b/i.test(text)
      ? 'back'
      : /\briten/i.test(text)
        ? 'held'
        : /\b(rit|ritard\w*|rall\w*|slentando|allargando)\b/i.test(text)
          ? 'slower'
          : /\b(accel\w*|stringendo)\b/i.test(text)
            ? 'faster'
            : null;
  return kind && { kind, slight: /\bpoco\b/i.test(text) };
}

/** How far a change of pace goes, as a share of the pace it starts from. */
export interface PaceDepths {
  /** A ritardando that runs to the end of the piece. */
  readonly final: number;
  /** A ritardando in the middle of the piece. */
  readonly passing: number;
  /** An accelerando. */
  readonly faster: number;
  /** "riten.": this at once, the rest of the way gradually. */
  readonly held: number;
}

export const PACE_DEPTHS: PaceDepths = { final: 0.7, passing: 0.85, faster: 1.25, held: 0.9 };

/** How a runner brakes: by the cube (the shape listeners liked best in the study). */
const BRAKING = 3;

/**
 * The pace `x` of the way through a ritardando (0 to 1) that ends at `to` of the pace it began
 * at: it falls slowly at first and fastest at the end.
 */
export const ritardando = (x: number, to: number): number => (1 + (to ** BRAKING - 1) * Math.min(1, Math.max(0, x))) ** (1 / BRAKING);

/** The pace is set anew this often along a change of pace, in quarter notes. */
const STEP = 0.25;
/** A ritardando with nothing after it to end it runs to the end of the piece when the end is within this many bars. */
const FINAL_BARS = 8;

/**
 * The tempo changes that play the piece's words of pace: steps along each ritardando and
 * accelerando, the pace given back at "a tempo". `tempos` are the piece's own tempo changes (the
 * words work on the pace in force); `defaultTempo` holds where the piece sets none.
 */
export function paceTempos(notation: Notation, defaultTempo: number, depths: PaceDepths = PACE_DEPTHS): TempoChange[] {
  const words = notation.words.flatMap((mark) => {
    const pace = paceWords(mark.text);
    return pace ? [{ beat: mark.beat, ...pace }] : [];
  });
  if (words.length === 0) return [];

  const own = [...notation.tempos].sort((a, b) => a.beat - b.beat);
  const onsets = [...new Set(notation.notes.map((note) => note.beat))].sort((a, b) => a - b);
  const lastBar = notation.bars.at(-1);
  const end = lastBar ? lastBar.start + lastBar.length : 0;
  const barAt = (beat: number) => Math.max(0, lastAtOrBefore(notation.bars, beat + 1e-9, (bar) => bar.start));

  const made: TempoChange[] = [];
  const set = (beat: number, bpm: number) => made.push({ bar: barAt(beat), beat, bpm });
  /** The pace in force at `beat`: the last set at or before it, by the piece or by the words so far. */
  const paceAt = (beat: number): number => {
    const byPiece = own[lastAtOrBefore(own, beat + 1e-9, (tempo) => tempo.beat)];
    const byWords = made.filter((tempo) => tempo.beat <= beat + 1e-9).at(-1);
    if (byWords && (!byPiece || byWords.beat >= byPiece.beat)) return byWords.bpm;
    return byPiece?.bpm ?? defaultTempo;
  };

  const first = own[0] && own[0].beat <= 1e-9 ? own[0].bpm : defaultTempo;
  /** The pace before the last change, for "a tempo" to give back. */
  let before = first;

  words.forEach((word, index) => {
    const from = paceAt(word.beat);
    if (word.kind === 'back' || word.kind === 'first') {
      set(word.beat, word.kind === 'first' ? first : before);
      return;
    }
    before = from;

    // It runs until something else sets the pace: the piece, or the next words of pace.
    const nextTempo = own.find((tempo) => tempo.beat > word.beat + 1e-9)?.beat ?? Infinity;
    const nextWords = words[index + 1]?.beat ?? Infinity;
    const stop = Math.min(nextTempo, nextWords);
    const barsLeft = notation.bars.length - barAt(word.beat);
    const toTheEnd = stop === Infinity && barsLeft <= FINAL_BARS;
    // With nothing to end it and the end far off: through the next bar, and then the pace comes back.
    const nextBar = notation.bars[barAt(word.beat) + 1];
    const until = stop !== Infinity ? stop : toTheEnd || !nextBar ? end : nextBar.start + nextBar.length;
    const givenBack = stop === Infinity && !toTheEnd;

    // The slowest (or the fastest) is reached at the last note struck before it ends.
    const lastOnset = onsets[lastAtOrBefore(onsets, until - 1e-6, (onset) => onset)];
    const arrive = toTheEnd && lastOnset !== undefined && lastOnset > word.beat + 1e-6 ? lastOnset : until;

    const whole = word.kind === 'faster' ? depths.faster : toTheEnd ? depths.final : depths.passing;
    const to = word.slight ? 1 - (1 - whole) / 2 : whole;
    const atOnce = word.kind === 'held' ? Math.max(to, depths.held) : 1;
    const length = arrive - word.beat;
    const pace = (x: number) => (word.kind === 'faster' ? 1 + (to - 1) * x : atOnce * ritardando(x, to / atOnce));

    for (let beat = word.beat; beat < arrive - 1e-6; beat += STEP) set(beat, from * pace((beat - word.beat) / length));
    // The last note of the piece is held longer, but not for as long as that pace would make it:
    // it has only to die away (and a fermata over it holds it further).
    // (Where the piece sets a tempo of its own there, that is the pace from then on.)
    if (stop !== nextTempo || stop === Infinity) set(arrive, from * (toTheEnd ? Math.sqrt(to) : to));
    if (givenBack) set(until, from);
  });
  return made;
}
