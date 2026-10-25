import { describe, expect, it } from 'vitest';
import { en } from '../src/ui/i18n/en';
import { noteLabel } from '../src/ui/i18n/notes';
import { DICTIONARIES, LOCALES, translate } from '../src/ui/i18n/translate';

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'barPosition', { current: 2, total: 8 })).toBe('Bar 2 / 8');
    expect(translate('ru', 'barPosition', { current: 2, total: 8 })).toBe('Такт 2 / 8');
  });

  it('keeps unknown placeholders visible', () => {
    expect(translate('en', 'barPosition', { current: 2 })).toBe('Bar 2 / {total}');
  });

  it('picks the English plural form', () => {
    expect(translate('en', 'planSteps', { count: 1 })).toBe('Plan: 1 step');
    expect(translate('en', 'planSteps', { count: 8 })).toBe('Plan: 8 steps');
  });

  it('picks the Russian plural form', () => {
    expect(translate('ru', 'planSteps', { count: 1 })).toBe('План: 1 шаг');
    expect(translate('ru', 'planSteps', { count: 3 })).toBe('План: 3 шага');
    expect(translate('ru', 'planSteps', { count: 5 })).toBe('План: 5 шагов');
    expect(translate('ru', 'planSteps', { count: 11 })).toBe('План: 11 шагов');
    expect(translate('ru', 'planSteps', { count: 21 })).toBe('План: 21 шаг');
    expect(translate('ru', 'recordedNotes', { count: 48 })).toBe('Записано 48 нот');
  });

  it('has every key in every language', () => {
    // TypeScript already enforces this; the test guards against casts and `any`.
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort()).toEqual(Object.keys(en).sort());
    }
  });
});

describe('noteLabel', () => {
  it('uses letter names and scientific octaves in English', () => {
    expect(noteLabel(60, 'en')).toBe('C4');
    expect(noteLabel(61, 'en')).toBe('C♯4');
    expect(noteLabel(21, 'en')).toBe('A0');
    expect(noteLabel(108, 'en')).toBe('C8');
  });

  it('uses solfège and Russian octave numbering in Russian', () => {
    expect(noteLabel(60, 'ru')).toBe('До1'); // middle Do = первая октава
    expect(noteLabel(61, 'ru')).toBe('До♯1');
    expect(noteLabel(67, 'ru')).toBe('Соль1');
    expect(noteLabel(72, 'ru')).toBe('До2');
    expect(noteLabel(108, 'ru')).toBe('До5');
  });

  it('abbreviates the octaves below the first one in Russian', () => {
    expect(noteLabel(48, 'ru')).toBe('До м');
    expect(noteLabel(36, 'ru')).toBe('До б');
    expect(noteLabel(24, 'ru')).toBe('До к');
    expect(noteLabel(21, 'ru')).toBe('Ля ск');
  });
});
