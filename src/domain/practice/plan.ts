import type { Hand } from '../note';
import type { Score } from '../score';
import { partsOf, type Part } from './parts';
import { musicOf } from './repeats';

/*
 * A plan for learning a piece: the steps a teacher sets, part by part, each with its own tempo.
 * Each hand alone and slow, both hands slow, then up to tempo, and the part joined to the one
 * before it; the whole piece at the end. Bars written out again note for note are learnt once
 * (see repeats.ts). The hard places first, hands apart, then together (Chang, Fundamentals of
 * Piano Practice); a step is done when it is played right several times running,
 * not when it has been played long (Duke, Simmons and Cash, 2009: see PracticePlan).
 */

/** The hands a step is played with: one alone, or both. */
export type StepHands = Hand | 'both';

/**
 * What a step is: a hand alone, slow (`alone`); both hands, slow (`together`); up to tempo with
 * the trainer (`up`); a part joined to the one before it, at tempo (`join`); the whole piece (`whole`).
 */
export type StepKind = 'alone' | 'together' | 'up' | 'join' | 'whole';

export interface PlanStep {
  readonly kind: StepKind;
  /** Printed bars `from..to`, both counted (indices into `score.notation.bars`). */
  readonly from: number;
  readonly to: number;
  readonly hands: StepHands;
  /** The tempo it is played at (as a share of the piece's own); for `up`, the tempo the trainer begins at. */
  readonly tempo: number;
  /** For `up`: the tempo the trainer takes it to. */
  readonly aim?: number;
}

/** The slow steps are played at this much of the piece's own tempo: slow enough to read the notes and find the fingers, not so slow that the hands move otherwise than at speed. */
export const SLOW = 0.6;
/** The tempo a part is brought up to: the piece's own. */
export const AT_TEMPO = 1;

/** The steps for learning a piece, part by part, in order. */
export function planOf(score: Score): PlanStep[] {
  const parts = partsOf(score);
  const steps: PlanStep[] = [];
  // The music of the parts and the hands' lines learnt, and of the joins played: what is written out again is not learnt again.
  const learnt = new Set<string>();
  const played = new Set<string>();
  parts.forEach((part, index) => {
    const hands = handsIn(score, part);
    if (hands.length === 0) return;
    const music = musicOf(score, part);
    if (!learnt.has(music)) {
      learnt.add(music);
      const both: StepHands = hands.length === 2 ? 'both' : hands[0]!;
      // A hand alone only where the other plays too (otherwise it is the part itself), and once for a line.
      if (hands.length === 2) {
        for (const hand of hands) {
          const line = `${hand} ${musicOf(score, part, hand)}`;
          if (learnt.has(line)) continue;
          learnt.add(line);
          steps.push({ kind: 'alone', ...part, hands: hand, tempo: SLOW });
        }
      }
      steps.push({ kind: hands.length === 2 ? 'together' : 'alone', ...part, hands: both, tempo: SLOW });
      steps.push({ kind: 'up', ...part, hands: both, tempo: SLOW, aim: AT_TEMPO });
    }
    const before = parts[index - 1];
    if (!before) return;
    const join = { from: before.from, to: part.to };
    const way = musicOf(score, join);
    if (played.has(way)) return;
    played.add(way);
    steps.push({ kind: 'join', ...join, hands: handsOf(score, join), tempo: AT_TEMPO });
  });
  const last = score.notation.bars.length - 1;
  const joined = steps.at(-1);
  // The whole piece, unless the last step played it already (a piece of one part, or two joined).
  if (parts.length > 1 && !(joined?.kind === 'join' && joined.from === 0 && joined.to === last)) {
    steps.push({ kind: 'whole', from: 0, to: last, hands: handsOf(score, { from: 0, to: last }), tempo: AT_TEMPO });
  }
  return steps;
}

/** The hands that play in a part, right first. */
function handsIn(score: Score, part: Part): Hand[] {
  const { bars, notes } = score.notation;
  const start = bars[part.from]!.start;
  const end = bars[part.to]!.start + bars[part.to]!.length;
  const playing = new Set(notes.filter((note) => note.beat >= start && note.beat < end).map((note) => note.hand));
  return (['right', 'left'] as const).filter((hand) => playing.has(hand));
}

const handsOf = (score: Score, part: Part): StepHands => {
  const hands = handsIn(score, part);
  return hands.length === 1 ? hands[0]! : 'both';
};
