import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useMirror } from '../src/ui/app/useMirror';

/* A use case mirrored into a component: a stand-in that counts, and tells when it has. */

function counter() {
  const listeners = new Set<() => void>();
  let count = 0;
  return {
    get count() {
      return count;
    },
    listeners,
    add() {
      count++;
      for (const listener of listeners) listener();
    },
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('useMirror', () => {
  it('has what the use case has now, and again each time the use case says it has changed', () => {
    const source = counter();
    const scope = effectScope();
    const mirror = scope.run(() => useMirror(source, () => ({ count: source.count })))!;
    expect(mirror.value).toEqual({ count: 0 });
    source.add();
    source.add();
    expect(mirror.value).toEqual({ count: 2 });
    scope.stop();
  });

  it('gives a new snapshot each time: what is mirrored is replaced whole', () => {
    const source = counter();
    const scope = effectScope();
    const mirror = scope.run(() => useMirror(source, () => ({ count: source.count })))!;
    const before = mirror.value;
    source.add();
    expect(mirror.value).not.toBe(before);
    scope.stop();
  });

  it('stops listening when the component is gone', () => {
    const source = counter();
    const scope = effectScope();
    const mirror = scope.run(() => useMirror(source, () => source.count))!;
    expect(source.listeners.size).toBe(1);
    scope.stop();
    expect(source.listeners.size).toBe(0);
    source.add();
    expect(mirror.value).toBe(0);
  });
});
