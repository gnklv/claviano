import type { ExerciseHands, ExerciseId, ExerciseLevel } from '../../domain/exercises/catalog';
import type { WarmupStep } from '../../domain/exercises/warmup';
import { exerciseById } from '../../domain/exercises/catalog';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';

const WORDS = {
  'five-notes': { title: 'exerciseFiveNotesTitle', goal: 'exerciseFiveNotesGoal' },
  'five-notes-staccato': { title: 'exerciseFiveNotesStaccatoTitle', goal: 'exerciseFiveNotesStaccatoGoal' },
  'broken-triad': { title: 'exerciseBrokenTriadTitle', goal: 'exerciseBrokenTriadGoal' },
  'triad': { title: 'exerciseTriadTitle', goal: 'exerciseTriadGoal' },
  'scale-one-octave': { title: 'exerciseScaleOneOctaveTitle', goal: 'exerciseScaleOneOctaveGoal' },
  'scale-two-octaves': { title: 'exerciseScaleTwoOctavesTitle', goal: 'exerciseScaleTwoOctavesGoal' },
  'broken-inversions': { title: 'exerciseBrokenInversionsTitle', goal: 'exerciseBrokenInversionsGoal' },
  'chord-changes': { title: 'exerciseChordChangesTitle', goal: 'exerciseChordChangesGoal' },
  'arpeggio': { title: 'exerciseArpeggioTitle', goal: 'exerciseArpeggioGoal' },
  'position-shifts': { title: 'exercisePositionShiftsTitle', goal: 'exercisePositionShiftsGoal' },
  'scale-rhythm': { title: 'exerciseScaleRhythmTitle', goal: 'exerciseScaleRhythmGoal' },
  'scale-groups': { title: 'exerciseScaleGroupsTitle', goal: 'exerciseScaleGroupsGoal' },
  'repeated-notes': { title: 'exerciseRepeatedNotesTitle', goal: 'exerciseRepeatedNotesGoal' },
  'trill': { title: 'exerciseTrillTitle', goal: 'exerciseTrillGoal' },
  'bass-chord': { title: 'exerciseBassChordTitle', goal: 'exerciseBassChordGoal' },
  'leaps': { title: 'exerciseLeapsTitle', goal: 'exerciseLeapsGoal' },
  'octaves': { title: 'exerciseOctavesTitle', goal: 'exerciseOctavesGoal' },
} satisfies Record<ExerciseId, { title: MessageKey; goal: MessageKey }>;
const LEVELS = { beginner: 'warmupBeginner', intermediate: 'warmupIntermediate', advanced: 'warmupAdvanced' } as const;
const HANDS = { right: 'rightHand', left: 'leftHand', both: 'stepBoth' } as const;

export function useExerciseWords() {
  const { t } = useI18n();
  return {
    title: (id: ExerciseId) => t(WORDS[id].title),
    goal: (id: ExerciseId) => t(WORDS[id].goal),
    hands: (hands: ExerciseHands) => t(HANDS[hands]),
    levelHint: (level: ExerciseLevel) => t(({ beginner: 'warmupBeginnerHint', intermediate: 'warmupIntermediateHint', advanced: 'warmupAdvancedHint' } as const)[level]),
    level: (level: ExerciseLevel) => t(LEVELS[level]),
    sequence: (steps: readonly WarmupStep[]) => steps.map(step => ({
      title: t(WORDS[step.exerciseId].title),
      detail: [t(HANDS[step.hands]), `${t('warmupStartingTempo')}: ${exerciseById(step.exerciseId).tempo}`, t('warmupRepetitions', { count: step.repetitions })].join(' · '),
    })),
    repetitions: (count: number) => t('warmupRepetitions', { count }),
  };
}
