export type ExerciseLevel = 'beginner' | 'intermediate' | 'advanced';

export type ExerciseHands = 'right' | 'left' | 'both';

export interface ExerciseDefinition {
  readonly id: ExerciseId;
  readonly level: ExerciseLevel;
  readonly title: string;
  readonly goal: string;
  readonly hands: readonly ExerciseHands[];
  readonly tempo: number;
  readonly warmup: boolean;
}
// Suggested starting tempi, not speed targets or examination standards.
const DEFINITIONS = [
  {
    id: 'five-notes', level: 'beginner', title: 'Five notes', goal: 'Play five rising and falling notes with an even sound and pulse.', hands: ['right', 'left'], tempo: 60, warmup: true
  },
  {
    id: 'five-notes-staccato', level: 'beginner', title: 'Five notes · staccato', goal: 'Release each key lightly, keeping the wrist free.', hands: ['right', 'left'], tempo: 60, warmup: true
  },
  {
    id: 'broken-triad', level: 'beginner', title: 'Broken triad', goal: 'Connect C, E and G without stretching between notes.', hands: ['right', 'left'], tempo: 60, warmup: true
  },
  {
    id: 'triad', level: 'beginner', title: 'Triad', goal: 'Play three notes together with an even, gentle attack.', hands: ['right', 'left'], tempo: 56, warmup: true
  },
  {
    id: 'scale-one-octave', level: 'intermediate', title: 'One-octave scale', goal: 'Pass the thumb smoothly on the way up and down.', hands: ['right', 'left', 'both'], tempo: 66, warmup: true
  },
  {
    id: 'scale-two-octaves', level: 'intermediate', title: 'Two-octave scale', goal: 'Keep the fingering consistent across both octaves.', hands: ['right', 'left', 'both'], tempo: 66, warmup: true
  },
  {
    id: 'broken-inversions', level: 'intermediate', title: 'Broken inversions', goal: 'Learn each inversion with a settled hand position.', hands: ['right', 'left', 'both'], tempo: 60, warmup: true
  },
  {
    id: 'chord-changes', level: 'intermediate', title: 'Chord changes', goal: 'Move between C, F and G chords with a relaxed release.', hands: ['right', 'left', 'both'], tempo: 56, warmup: true
  },
  {
    id: 'arpeggio', level: 'intermediate', title: 'Arpeggio', goal: 'Move the arm with the hand through a two-octave arpeggio.', hands: ['right', 'left', 'both'], tempo: 60, warmup: true
  },
  {
    id: 'position-shifts', level: 'intermediate', title: 'Position shifts', goal: 'Release before moving to the next five-finger position.', hands: ['right', 'left', 'both'], tempo: 60, warmup: true
  },
  {
    id: 'scale-rhythm', level: 'intermediate', title: 'Scale · dotted rhythm', goal: 'Keep long and short notes precise without rushing the thumb.', hands: ['right', 'left', 'both'], tempo: 60, warmup: true
  },
  {
    id: 'scale-groups', level: 'advanced', title: 'Scale · short groups', goal: 'Play brief even groups, then release during each rest.', hands: ['right', 'left', 'both'], tempo: 60, warmup: true
  },
  {
    id: 'repeated-notes', level: 'advanced', title: 'Repeated notes', goal: 'Change fingers on one key and release between groups.', hands: ['right', 'left'], tempo: 60, warmup: true
  },
  {
    id: 'trill', level: 'advanced', title: 'Trill preparation', goal: 'Alternate two fingers evenly in short relaxed groups.', hands: ['right', 'left'], tempo: 60, warmup: true
  },
  {
    id: 'bass-chord', level: 'advanced', title: 'Bass and chord', goal: 'Move the whole hand from the bass to the chord.', hands: ['right', 'left'], tempo: 56, warmup: true
  },
  {
    id: 'leaps', level: 'advanced', title: 'Leaps', goal: 'Prepare each landing during the rest; keep the arm free.', hands: ['right', 'left'], tempo: 56, warmup: false
  },
  {
    id: 'octaves', level: 'advanced', title: 'Octaves', goal: 'Check instrument and comfortable reach first; release each octave without tension.', hands: ['right', 'left'], tempo: 48, warmup: false
  },
] as const satisfies readonly (Omit<ExerciseDefinition, 'id'> & {
  readonly id: string;
})[];

export type ExerciseId = typeof DEFINITIONS[number]['id'];

export const EXERCISES: readonly ExerciseDefinition[] = DEFINITIONS;

export const exercisesFor = (level: ExerciseLevel): readonly ExerciseDefinition[] => EXERCISES.filter(exercise => exercise.level === level);

export function exerciseById(id: ExerciseId): ExerciseDefinition {
  const exercise = EXERCISES.find(exercise => exercise.id === id);
  if (!exercise)
    throw new Error(`Unknown exercise: ${id}`);
  return exercise;
}
