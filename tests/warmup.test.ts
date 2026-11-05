import { describe, expect, it } from 'vitest';
import { exerciseById, type ExerciseLevel } from '../src/domain/exercises/catalog';
import { exerciseScore } from '../src/domain/exercises/score';
import { planWarmup, type WarmupMinutes } from '../src/domain/exercises/warmup';

const levels: readonly ExerciseLevel[] = ['beginner', 'intermediate', 'advanced'];
const lengths: readonly WarmupMinutes[] = [5, 10, 15];

describe('a suggested warm-up', () => {
  it('gives each beginner exercise to the right hand and then the left', () => {
    const plan = planWarmup('beginner', 5);
    expect(plan.steps.map(step => [step.exerciseId, step.hands])).toEqual([
      ['five-notes', 'right'], ['five-notes', 'left'],
      ['five-notes-staccato', 'right'], ['five-notes-staccato', 'left'],
      ['broken-triad', 'right'], ['broken-triad', 'left'],
      ['triad', 'right'], ['triad', 'left'],
    ]);
  });

  for (const level of levels) {
    for (const minutes of lengths) {
      it(`builds about ${minutes} minutes of ${level} exercises at their stated tempos`, () => {
        const plan = planWarmup(level, minutes);
        expect(plan.level).toBe(level);
        expect(plan.minutes).toBe(minutes);
        expect(plan.steps.length).toBeGreaterThan(0);
        let total = 0;
        let largestPair = 0;
        for (const step of plan.steps) {
          const definition = exerciseById(step.exerciseId);
          expect(definition.level).toBe(level);
          expect(definition.warmup).toBe(true);
          expect(definition.hands).toContain(step.hands);
          expect(Number.isInteger(step.repetitions)).toBe(true);
          expect(step.repetitions).toBeGreaterThan(0);
          const pass = exerciseScore(step.exerciseId, step.hands).duration;
          expect(step.estimatedSeconds).toBeCloseTo(pass * step.repetitions);
          total += step.estimatedSeconds;
          largestPair = Math.max(largestPair, pass * (step.hands === 'both' ? 1 : 2));
        }
        expect(plan.estimatedSeconds).toBeCloseTo(total);
        // Whole passes, and separate hands kept together, are the resolution of the estimate.
        expect(Math.abs(total - minutes * 60)).toBeLessThanOrEqual(largestPair / 2 + 0.001);
        expect(planWarmup(level, minutes)).toEqual(plan);
      });
    }

    it(`adds real practice time without changing ${level} difficulty`, () => {
      const plans = lengths.map(minutes => planWarmup(level, minutes));
      expect(plans[1].estimatedSeconds).toBeGreaterThan(plans[0].estimatedSeconds);
      expect(plans[2].estimatedSeconds).toBeGreaterThan(plans[1].estimatedSeconds);
      const choices = plans.map(plan => plan.steps.map(step => [step.exerciseId, step.hands]));
      expect(choices[1]).toEqual(choices[0]);
      expect(choices[2]).toEqual(choices[0]);
      plans[0].steps.forEach((step, index) => {
        expect(plans[1].steps[index].repetitions).toBeGreaterThanOrEqual(step.repetitions);
        expect(plans[2].steps[index].repetitions).toBeGreaterThanOrEqual(plans[1].steps[index].repetitions);
      });
    });

    it(`gives separate hands equal practice in a ${level} warm-up`, () => {
      const plan = planWarmup(level, 15);
      const separate = plan.steps.filter(step => step.hands !== 'both');
      for (const step of separate.filter(step => step.hands === 'right')) {
        const other = separate.find(candidate => candidate.exerciseId === step.exerciseId && candidate.hands === 'left');
        expect(other?.repetitions).toBe(step.repetitions);
        expect(other?.estimatedSeconds).toBeCloseTo(step.estimatedSeconds);
      }
    });
  }

  it('uses both hands where the selected level offers them, without silently adding octaves or leaps', () => {
    expect(planWarmup('intermediate', 5).steps.every(step => step.hands === 'both')).toBe(true);
    const advanced = planWarmup('advanced', 5);
    expect(advanced.steps.map(step => step.exerciseId)).toContain('scale-groups');
    expect(advanced.steps.map(step => step.exerciseId)).not.toContain('octaves');
    expect(advanced.steps.map(step => step.exerciseId)).not.toContain('leaps');
  });

  it('rejects unsupported durations and levels instead of building a misleading session', () => {
    expect(() => planWarmup('beginner', 0 as WarmupMinutes)).toThrow(RangeError);
    expect(() => planWarmup('beginner', NaN as WarmupMinutes)).toThrow(RangeError);
    expect(() => planWarmup('expert' as ExerciseLevel, 5)).toThrow(RangeError);
  });
});
