import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../src/ui/theme/resolveTheme';

describe('resolveTheme', () => {
  it('follows the system in auto mode', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('ignores the system when chosen manually', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
