import type { Hand, Note } from '../note';
import type { Score } from '../score';
import { SAME_MOMENT } from '../moment';
import { plainNotesOf } from '../notation/performance';
import { layersOf, type WrittenLayer } from './layers';
import { scoreForLayer } from './layerScore';
import { partsOf, type Part } from './parts';
import { musicOf } from './repeats';

/*
 * A plan for learning a piece: the steps a teacher sets, part by part, each with its own tempo.
 * A mapped part begins with its leading line, then its bass, before its complete slow form. Older
 * scores begin with each hand alone and then together. Each part goes up to tempo and is joined
 * to the one before it; the whole piece comes at the end. Each task is demonstrated with its
 * selected notes and hands; muting is the learner's choice. Bars written out again note for note are learnt once
 * (see repeats.ts). The hard places first, hands apart, then together (Chang, Fundamentals of
 * Piano Practice); a step is done when it is played right several times running,
 * not when it has been played long (Duke, Simmons and Cash, 2009: see PracticePlan).
 */

/** The hands a step is played with, by the one learning it: one alone, or both. */
export type StepHands = Hand | 'both';

/**
 * What a step is: a reduced written layer (`layer`); a hand alone, slow, to the metronome (`alone`); a hand slow, the other heard
 * (`with`); both hands, slow (`together`); up to tempo through assessed passes (`up`); a part joined to
 * the one before it, at tempo (`join`); the whole piece (`whole`).
 */
export type StepKind = 'layer' | 'alone' | 'with' | 'together' | 'up' | 'join' | 'whole';

export interface PlanStep {
  readonly kind: StepKind;
  /** Printed bars `from..to`, both counted (indices into `score.notation.bars`). */
  readonly from: number;
  readonly to: number;
  readonly hands: StepHands;
  /** The tempo it is played at (as a share of the piece's own); for `up`, the tempo the task begins at. */
  readonly tempo: number;
  /** For `up`: the target tempo, and by how much at a step. */
  readonly aim?: number;
  readonly by?: number;
  /** A reduced written layer played before the complete part. */
  readonly layer?: 'lead' | 'lead-bass' | 'lead-hand-bass' | 'full';
  readonly addedHand?: Hand;
  /** Practise the principal notes before adding the written ornaments and grace notes. */
  readonly plain?: true;
  /** The complete slow task restores the decorations after its plain preparation. */
  readonly restoreOrnaments?: true;
}

/** Stored step indices belong to this plan generation. Older indices are migrated by meaning. */
export const PLAN_VERSION = 4;

/** The slow steps are played at this much of the piece's own tempo: slow enough to read the notes and find the fingers, not so slow that the hands move otherwise than at speed. */
export const SLOW = 0.6;
/** The tempo a part is brought up to: the piece's own. */
export const AT_TEMPO = 1;
/** A part is brought up by this much at a step: from 60% in four clean steps up; a slip takes one step back. */
export const UP_BY = 0.1;

/** The steps for learning a piece, part by part, in order. */
export function planOf(score: Score): PlanStep[] {
  return buildPlan(score, 'current');
}

/** The layer plan whose version-two progress was saved before the complete-hand step existed. */
export function planV2Of(score: Score): PlanStep[] {
  return buildPlan(score, 'v2');
}

/** Version three added the complete leading hand but still played every decoration. */
export function planV3Of(score: Score): PlanStep[] {
  return buildPlan(score, 'v3');
}

/** The plan whose unversioned progress older versions kept. */
export function legacyPlanOf(score: Score): PlanStep[] {
  return buildPlan(score, 'legacy');
}

function buildPlan(score: Score, mode: 'legacy' | 'v2' | 'v3' | 'current'): PlanStep[] {
  const parts = partsOf(score);
  const steps: PlanStep[] = [];
  let plainNotes: readonly Note[] | undefined;
  const preparePlain = () => plainNotes ??= plainNotesOf(score);
  const musicIn = (part: Part, hand?: Hand) => musicOf(score, part, hand) + (mode === 'current' ? decorationsOf(score, part, hand) : '');
  // The music of the parts and the hands' lines learnt, and of the joins played: what is written out again is not learnt again.
  const learnt = new Set<string>();
  const played = new Set<string>();
  parts.forEach((part, index) => {
    const hands = handsIn(score, part);
    if (hands.length === 0) return;
    const music = musicIn(part);
    if (!learnt.has(music)) {
      learnt.add(music);
      const both: StepHands = hands.length === 2 ? 'both' : hands[0]!;
      const preparation = mode === 'legacy' ? { layers: [], plain: false } : preparationLayers(score, part, mode === 'current' ? preparePlain : undefined);
      const layers = preparation.layers.filter((layer) => mode !== 'v2' || layer.kind !== 'lead-hand-bass');
      // A hand by itself only where the other plays too (otherwise it is the part itself): alone once
      // for a line, and then to the other hand, which keeps it in time and in the harmony.
      if (layers.length) {
        for (const layer of layers) {
          const selectedHands = new Set(layer.notes.map((index) => score.notation.notes[index]!.hand));
          steps.push({ kind: 'layer', layer: layer.kind, ...(layer.addedHand ? { addedHand: layer.addedHand } : {}),
            ...(preparation.plain ? { plain: true } : {}), ...part, hands: selectedHands.size === 2 ? 'both' : [...selectedHands][0]!, tempo: SLOW });
        }
      } else if (hands.length === 2) {
        for (const hand of hands) {
          const line = `${hand} ${musicIn(part, hand)}`;
          if (!learnt.has(line)) steps.push({ kind: 'alone', ...part, hands: hand, tempo: SLOW });
          learnt.add(line);
          steps.push({ kind: 'with', ...part, hands: hand, tempo: SLOW });
        }
      }
      steps.push({ kind: hands.length === 2 ? 'together' : 'alone', ...part, hands: both, tempo: SLOW,
        ...(preparation.plain ? { restoreOrnaments: true } : {}) });
      steps.push({ kind: 'up', ...part, hands: both, tempo: SLOW, aim: AT_TEMPO, by: UP_BY });
    }
    const before = parts[index - 1];
    if (!before) return;
    const join = { from: before.from, to: part.to };
    const way = musicIn(join);
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

function preparationLayers(score: Score, part: Part, preparePlain?: () => readonly Note[]): { layers: readonly WrittenLayer[]; plain: boolean } {
  try {
    const layers = layersOf(score, part).layers;
    const full = layers.find((layer) => layer.kind === 'full');
    if (!full) return { layers: [], plain: false };
    // An older score may have notation but no reliable link from it to performed events.
    scoreForLayer(score, part, full);
    const reduced = layers.filter((layer) => layer.kind !== 'full');
    if (!preparePlain || !decorationsOf(score, part)) return { layers: reduced, plain: false };
    const notes = preparePlain();
    if (notes === score.notes) return { layers: reduced, plain: false };
    const plain = { ...score, notes };
    const complete = scoreForLayer(plain, part, full).notes;
    const last = reduced.at(-1);
    const selected = last ? new Set(scoreForLayer(plain, part, last).notes) : null;
    // Written subsets can describe the same sounding event through a tie. Do not ask twice.
    const alreadyFull = selected && selected.size === complete.length && complete.every((note) => selected.has(note));
    return { layers: alreadyFull ? reduced : [...reduced, full], plain: true };
  } catch {
    return { layers: [], plain: false };
  }
}

/** A decorated reprise needs preparation of its own; old plan generations keep their old keys. */
function decorationsOf(score: Score, part: Part, hand?: Hand): string {
  const { notes, graces, bars } = score.notation;
  const start = bars[part.from]!.start;
  const at = (beat: number) => Math.round((beat - start) / SAME_MOMENT);
  const inPart = (bar: number) => bar >= part.from && bar <= part.to;
  const ornaments = notes.filter((note) => inPart(note.bar) && note.ornaments.length && (hand === undefined || note.hand === hand))
    .map((note) => JSON.stringify([note.hand, at(note.beat), note.sounding, note.ornaments])).sort();
  const groups = graces.filter((group) => inPart(group.bar)).flatMap((group) => {
    const playing = group.notes.filter((note) => hand === undefined || note.hand === hand);
    if (!playing.length) return [];
    const anchor = group.leadsTo === null ? null : notes[group.leadsTo];
    return [JSON.stringify([at(group.beat), anchor ? [at(anchor.beat), anchor.sounding, anchor.hand] : null,
      playing.map((note) => [note.sounding, note.hand, note.chord, note.slash])])];
  }).sort();
  return ornaments.length || groups.length ? `|decorations:${JSON.stringify([ornaments, groups])}` : '';
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
