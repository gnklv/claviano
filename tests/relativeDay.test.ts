import { describe, expect, it } from 'vitest';
import { relativeDay } from '../src/ui/i18n/relativeDay';

describe('relativeDay', () => {
  const at = (date: string) => new Date(date).getTime();
  const now = at('2026-10-11T15:00:00');

  it('says today, yesterday and a few days ago in words', () => {
    expect(relativeDay(at('2026-10-11T00:05:00'), now, 'en')).toBe('today');
    expect(relativeDay(at('2026-10-10T23:55:00'), now, 'en')).toBe('yesterday');
    expect(relativeDay(at('2026-10-08T09:00:00'), now, 'en')).toBe('3 days ago');
    expect(relativeDay(at('2026-10-11T00:05:00'), now, 'ru')).toBe('сегодня');
    expect(relativeDay(at('2026-10-10T23:55:00'), now, 'ru')).toBe('вчера');
    expect(relativeDay(at('2026-10-08T09:00:00'), now, 'ru')).toBe('3 дня назад');
  });

  it('gives the date of a day more than a month back, with the year when it is another one', () => {
    expect(relativeDay(at('2026-09-12T09:00:00'), now, 'ru')).toBe('29 дней назад');
    expect(relativeDay(at('2026-08-12T09:00:00'), now, 'en')).toBe('August 12');
    expect(relativeDay(at('2026-08-12T09:00:00'), now, 'ru')).toBe('12 августа');
    expect(relativeDay(at('2025-12-31T09:00:00'), now, 'en')).toBe('December 31, 2025');
  });

  it('takes a time ahead of now (a clock set back) for today', () => {
    expect(relativeDay(at('2026-10-12T09:00:00'), now, 'en')).toBe('today');
  });
});
