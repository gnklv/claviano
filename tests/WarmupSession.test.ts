import { describe, expect, it, vi } from 'vitest';
import { WarmupSession } from '../src/application/use-cases/WarmupSession';
import { planWarmup } from '../src/domain/exercises/warmup';

describe('a warm-up session', () => {
  it('starts with the selected level and time, preserving the suggested repetitions', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const session = new WarmupSession();
      session.start(level, 10);
      expect(session.status).toBe('active');
      expect(session.selection).toEqual({ mode: 'warmup', level, minutes: 10 });
      expect(session.steps).toEqual(planWarmup(level, 10).steps);
      expect(session.current).toBe(0);
      expect(session.step).toBe(session.steps[0]);
    }
  });

  it('opens the requested single exercise and hand, even when it is not in automatic suggestions', () => {
    const session = new WarmupSession();
    session.startExercise('octaves', 'left');
    expect(session.selection).toEqual({ mode: 'exercise', exerciseId: 'octaves', hands: 'left' });
    expect(session.steps).toHaveLength(1);
    expect(session.step?.exerciseId).toBe('octaves');
    expect(session.step?.hands).toBe('left');
    expect(session.step?.repetitions).toBe(1);
    expect(session.step?.estimatedSeconds).toBeGreaterThan(0);
  });

  it('moves only by hand and leaves the last task for an explicit finish', () => {
    const session = new WarmupSession();
    session.start('beginner', 5);
    for (let index = 1; index < session.steps.length; index++) {
      session.next();
      expect(session.current).toBe(index);
    }
    session.next();
    expect(session.status).toBe('active');
    expect(session.current).toBe(session.steps.length - 1);
    session.finish();
    expect(session.status).toBe('finished');
    session.resume();
    session.next();
    expect(session.status).toBe('finished');
  });

  it('keeps the queue and task while away, and can finish early or begin the same selection again', () => {
    const session = new WarmupSession();
    session.start('intermediate', 15);
    session.next();
    const steps = session.steps;
    session.leave();
    expect(session.status).toBe('away');
    session.next();
    expect(session.current).toBe(1);
    expect(session.steps).toBe(steps);
    session.resume();
    expect(session.status).toBe('active');
    expect(session.current).toBe(1);
    session.finish();
    session.restart();
    expect(session.status).toBe('active');
    expect(session.current).toBe(0);
    expect(session.selection).toEqual({ mode: 'warmup', level: 'intermediate', minutes: 15 });
    expect(session.steps).not.toBe(steps);
  });

  it('leaves the current session untouched when a new choice is invalid', () => {
    const session = new WarmupSession();
    session.start('beginner', 5);
    session.next();
    const steps = session.steps;
    expect(() => session.startExercise('five-notes', 'both')).toThrow();
    expect(session.steps).toBe(steps);
    expect(session.current).toBe(1);
    expect(session.status).toBe('active');
  });

  it('notifies changes, unsubscribes, and keeps nothing in a new visit', () => {
    const session = new WarmupSession();
    const changed = vi.fn();
    const stop = session.onChange(changed);
    session.next();
    session.resume();
    session.finish();
    session.restart();
    expect(changed).not.toHaveBeenCalled();
    session.startExercise('trill', 'right');
    expect(changed).toHaveBeenCalledOnce();
    stop();
    session.leave();
    session.restart();
    expect(changed).toHaveBeenCalledOnce();
    const fresh = new WarmupSession();
    expect(fresh.status).toBe('idle');
    expect(fresh.steps).toEqual([]);
    expect(fresh.step).toBeNull();
  });
});
