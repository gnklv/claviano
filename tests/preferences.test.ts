// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preference, rereadPreferences } from '../src/ui/kept/preferences';

/* The interface's choices, kept in the browser's storage. (Each test has a key of its own: a choice is one for the whole page.) */

let key: string;
let count = 0;
beforeEach(() => {
  localStorage.clear();
  key = `test.choice.${count++}`;
});

describe('a choice kept between visits', () => {
  it('is what it is said to be until something is chosen, and is then kept', () => {
    const choice = preference(key, ['a', 'b'], 'a');
    expect(choice.value).toBe('a');
    expect(localStorage.getItem(key)).toBeNull();
    choice.value = 'b';
    expect(localStorage.getItem(key)).toBe('b');
  });

  it('is read from what was kept, unless that is none of what can be chosen', () => {
    localStorage.setItem(key, 'b');
    expect(preference(key, ['a', 'b'], 'a').value).toBe('b');
    const other = `${key}.other`;
    localStorage.setItem(other, 'nonsense');
    expect(preference(other, ['a', 'b'], 'a').value).toBe('a');
  });

  it('can be found by asking (the browser’s language) where nothing is kept', () => {
    expect(preference(key, ['en', 'ru'], () => 'ru').value).toBe('ru');
  });

  it('is one for the whole app: whoever asks gets the same', () => {
    const one = preference(key, ['a', 'b'], 'a');
    const other = preference(key, ['a', 'b'], 'a');
    one.value = 'b';
    expect(other.value).toBe('b');
  });

  it('is read again when storage has changed under it, without being written back', () => {
    const choice = preference(key, ['a', 'b'], 'a');
    choice.value = 'b';
    localStorage.clear();
    rereadPreferences();
    expect(choice.value).toBe('a');
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, 'b');
    window.dispatchEvent(new Event('storage'));
    expect(choice.value).toBe('b');
  });

  it('lasts for the visit where the browser gives no storage', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('no storage');
      },
      setItem() {
        throw new Error('no storage');
      },
    });
    const choice = preference(key, ['a', 'b'], 'a');
    choice.value = 'b';
    expect(choice.value).toBe('b');
    vi.unstubAllGlobals();
  });
});
