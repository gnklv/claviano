import type { Hand } from '../note';
import { scaleFingers } from '../fingering/scales';
import type { ExerciseId } from './catalog';

export type ExerciseStep = {
  pitches: readonly number[];
  fingers: readonly number[];
  beats: number;
  short?: boolean;
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const single = (pitch: number, finger: number, beats = 1, short = false): ExerciseStep => ({
  pitches: [pitch], fingers: [finger], beats, short,
});

export const rest = (beats: number): ExerciseStep => ({ pitches: [], fingers: [], beats });
const chord = (pitches: number[], fingers: number[], beats = 2): ExerciseStep => ({ pitches, fingers, beats });
function scale(hand: Hand, octaves: number, rhythm = false): ExerciseStep[] {
  const up = Array.from({ length: octaves * 7 + 1 }, (_, i) => MAJOR[i % 7]! + 12 * Math.floor(i / 7));
  const pitches = [...up, ...up.slice(0, -1).reverse()];
  const fingers = scaleFingers(pitches.map(p => p + 60), hand, { tonic: 0, minor: false });
  return pitches.map((pitch, i) => single(pitch, fingers[i]!, rhythm ? (i % 2 === 0 ? 0.75 : 0.25) : 0.5));
}

export function exercisePattern(id: ExerciseId, hand: Hand): ExerciseStep[] {
  const right = hand === 'right';
  const five = (offset = 0) => [0, 2, 4, 5, 7, 5, 4, 2].map((p, i) => single(p + offset, right ? [1, 2, 3, 4, 5, 4, 3, 2][i]! : [5, 4, 3, 2, 1, 2, 3, 4][i]!, 0.5));
  const triadFingers = right ? [1, 3, 5] : [5, 3, 1];
  switch (id) {
    case 'five-notes':
      return five();
    case 'five-notes-staccato':
      return five().map(s => ({ ...s, short: true }));
    case 'broken-triad':
      return [0, 4, 7, 4, 0, 4, 7, 4].map((p, i) => single(p, triadFingers[[0, 1, 2, 1][i % 4]!]!, 0.5));
    case 'triad':
      return [chord([0, 4, 7], triadFingers), rest(2), chord([0, 4, 7], triadFingers), rest(2)];
    case 'scale-one-octave':
      return scale(hand, 1);
    case 'scale-two-octaves':
      return scale(hand, 2);
    case 'scale-rhythm':
      return scale(hand, 1, true);
    case 'broken-inversions': {
      const pitches = [[0, 4, 7], [4, 7, 12], [7, 12, 16]];
      const fingers = right ? [[1, 3, 5], [1, 2, 5], [1, 3, 5]] : [[5, 3, 1], [5, 3, 1], [5, 2, 1]];
      return pitches.flatMap((ps, i) => [...ps.map((p, j) => single(p, fingers[i]![j]!, 0.5)), rest(0.5)]);
    }
    case 'chord-changes':
      return [[0, 4, 7], [0, 5, 9], [2, 7, 11], [0, 4, 7]].flatMap((pitches, index) => {
        const fingers = right ? [1, 3, 5] : index === 0 || index === 3 ? [5, 3, 1] : [5, 2, 1];
        return [chord(pitches, fingers), rest(2)];
      });
    case 'arpeggio': {
      const pitches = [0, 4, 7, 12, 16, 19, 24];
      const fingers = right ? [1, 2, 3, 1, 2, 3, 5] : [5, 3, 2, 1, 3, 2, 1];
      return [...pitches, ...pitches.slice(0, -1).reverse()].map((pitch, index) => single(pitch, fingers[index < 7 ? index : 12 - index]!, 0.5));
    }
    case 'position-shifts':
      return [...five(), rest(4), ...five(7), rest(4)];
    case 'scale-groups': {
      const pitches = [[0, 2, 4, 5], [4, 5, 7, 9], [7, 9, 11, 12]];
      const fingers = right
        ? [[1, 2, 3, 1], [3, 1, 2, 3], [2, 3, 4, 5]]
        : [[5, 4, 3, 2], [3, 2, 1, 3], [1, 3, 2, 1]];
      return pitches.flatMap((group, index) => [
        ...group.map((pitch, note) => single(pitch, fingers[index]![note]!, 0.25)),
        rest(1),
      ]);
    }
    case 'repeated-notes':
      return [0, 4, 7].flatMap(pitch => [
        ...[3, 2, 1, 3, 2, 1, 3, 2].map(finger => single(pitch, finger, 0.25)),
        rest(2),
      ]);
    case 'trill':
      return [0, 2, 4].flatMap(pitch => [
        ...Array.from({ length: 8 }, (_, index) => {
          const upper = index % 2 === 1;
          const neighbour = pitch === 4 ? 1 : 2;
          const finger = right ? (upper ? 3 : 2) : (upper ? 2 : 3);
          return single(pitch + (upper ? neighbour : 0), finger, 0.25);
        }),
        rest(2),
      ]);
    case 'bass-chord':
      return [0, 5, 7, 0].flatMap(p => [single(p - 12, right ? 1 : 5), rest(1), chord([p, p + 4, p + 7], triadFingers, 1), rest(1)]);
    case 'leaps':
      return [0, 12, 0, 19, 0, 12].flatMap(p => [single(p, right ? 1 : 5), rest(1)]);
    case 'octaves':
      return [0, 2, 4, 5, 7, 5, 4, 2].flatMap(p => [chord([p, p + 12], right ? [1, 5] : [5, 1], 1), rest(1)]);
  }
}
