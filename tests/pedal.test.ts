import { describe, expect, it } from 'vitest';
import type { Note } from '../src/domain/note';
import { pedalDownAt, pedalEvents, pedalSpans, soundingDurations } from '../src/domain/pedal';
import { softPedalWords } from '../src/domain/pedal';

const note = (pitch: number, start: number, duration: number): Note => ({
  pitch,
  start,
  duration,
  beat: start,
  beats: duration,
  velocity: 0.8,
  hand: 'right',
});

describe('pedalSpans', () => {
  it('joins presses and releases, ignoring a press while already down', () => {
    const spans = pedalSpans(
      [
        { time: 1, down: true },
        { time: 1.5, down: true },
        { time: 2, down: false },
        { time: 2.5, down: false },
      ],
      10,
    );
    expect(spans).toEqual([{ start: 1, end: 2 }]);
  });

  it('reads a release and a press at the same moment as a change', () => {
    const spans = pedalSpans(
      [
        { time: 0, down: true },
        { time: 2, down: true },
        { time: 2, down: false },
        { time: 4, down: false },
      ],
      10,
    );
    expect(spans).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('lifts a pedal still down at the end', () => {
    expect(pedalSpans([{ time: 3, down: true }], 5)).toEqual([{ start: 3, end: 5 }]);
  });
});

describe('pedalDownAt', () => {
  const pedal = [
    { start: 1, end: 2 },
    { start: 2, end: 3 },
    { start: 5, end: 6 },
  ];

  it('is down inside a span, including its start', () => {
    expect(pedalDownAt(pedal, 1)).toBe(true);
    expect(pedalDownAt(pedal, 2.5)).toBe(true);
    expect(pedalDownAt(pedal, 5.9)).toBe(true);
  });

  it('is up between spans and after the last one', () => {
    expect(pedalDownAt(pedal, 0.5)).toBe(false);
    expect(pedalDownAt(pedal, 4)).toBe(false);
    expect(pedalDownAt(pedal, 6)).toBe(false);
  });
});

describe('soundingDurations', () => {
  it('keeps notes as long as their keys without a pedal', () => {
    expect(soundingDurations([note(60, 0, 1), note(64, 1, 0.5)], [])).toEqual([1, 0.5]);
  });

  it('lets a key released under the pedal sound until the pedal comes up', () => {
    const pedal = [{ start: 0, end: 4 }];
    expect(soundingDurations([note(48, 0, 0.5), note(55, 1, 0.5)], pedal)).toEqual([4, 3]);
  });

  it('does not stretch a note held beyond the pedal', () => {
    expect(soundingDurations([note(60, 0, 5)], [{ start: 0, end: 4 }])).toEqual([5]);
  });

  it('keeps chords apart across a pedal change', () => {
    // The first chord is released right when the pedal is changed: the new span does not catch it.
    const pedal = [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ];
    expect(soundingDurations([note(60, 0, 2), note(62, 2, 1)], pedal)).toEqual([2, 2]);
  });

  it('silences a sustained key when it is struck again', () => {
    const pedal = [{ start: 0, end: 4 }];
    expect(soundingDurations([note(60, 0, 0.5), note(60, 1, 0.5)], pedal)).toEqual([1, 3]);
  });
});

describe('pedalEvents', () => {
  it('turns spans into presses, releases and changes', () => {
    const pedal = [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 5, end: 6 },
    ];
    expect(pedalEvents(pedal)).toEqual([
      { time: 0, kind: 'press' },
      { time: 2, kind: 'change' },
      { time: 4, kind: 'release' },
      { time: 5, kind: 'press' },
      { time: 6, kind: 'release' },
    ]);
  });

  it('reads a quick lift and press as a change', () => {
    const pedal = [
      { start: 0, end: 1 },
      { start: 1.05, end: 2 },
    ];
    expect(pedalEvents(pedal, 0.1).map((e) => e.kind)).toEqual(['press', 'change', 'release']);
    expect(pedalEvents(pedal).map((e) => e.kind)).toEqual(['press', 'release', 'press', 'release']);
  });
});

describe('sostenuto', () => {
  it('holds only the keys that are down when it is pressed', () => {
    // The bass is down when the middle pedal goes down at 0.5; the melody comes later.
    const sostenuto = [{ start: 0.5, end: 4 }];
    expect(soundingDurations([note(36, 0, 1), note(72, 2, 0.5)], [], sostenuto)).toEqual([4, 0.5]);
  });

  it('does not catch a key already released', () => {
    expect(soundingDurations([note(36, 0, 0.5)], [], [{ start: 1, end: 4 }])).toEqual([0.5]);
  });
});

describe('softPedalWords', () => {
  it('reads "una corda" as the left pedal down and "tre corde" as up', () => {
    expect(softPedalWords('una corda')).toBe('down');
    expect(softPedalWords('U.C.')).toBe('down');
    expect(softPedalWords('tre corde')).toBe('up');
    expect(softPedalWords('t. c.')).toBe('up');
    expect(softPedalWords('dolce')).toBeNull();
  });
});
