import { expect, test } from 'vitest';
import { measuredCueGlyphs, readCueTiming } from '../../../src/infrastructure/parsers/pdf/museScoreCues';
import { timePianoColumns } from '../../../src/infrastructure/parsers/pdf/museScoreVoiceColumns';
import { timeAttacks, timeSparseVoice } from '../../../src/infrastructure/parsers/pdf/pianoAttackTiming';
import type { PianoAttack } from '../../../src/infrastructure/parsers/pdf/pianoAttacks';

function note(x: number, duration: PianoAttack['duration'], beats: number, up = true, y = 2): PianoAttack {
  return {
    x, duration, beats, beams: [], stem: { x, up, far: up ? 5 : -1 },
    heads: [{ x, y, code: 0xe0a4, text: '\ue0a4', font: 'MScore', size: 4 }],
  };
}

const quarter = { value: 'quarter', dots: 0 } as const;
const half = { value: 'half', dots: 0 } as const;

test('places an aligned attack from a secondary voice with omitted rests', () => {
  const secondary = note(0, quarter, 1, false);
  const main = [note(0, quarter, 1), note(4, half, 2, false)];
  const reference = timeAttacks(main, 1, 3, false)!;
  const timing = timeSparseVoice([secondary, ...main], 1, 3, reference);

  expect(timing?.timed.map(item => [item.attack, item.beat, item.voice])).toEqual([
    [main[0], 0, 0], [secondary, 0, 1], [main[1], 1, 0],
  ]);
});

test('places a closing down-stem unison displaced by a dotted note', () => {
  const secondary = note(10.35, quarter, 1, false);
  const main = [note(0, half, 2), note(8, { value: 'eighth', dots: 1 }, 0.75),
    note(14, { value: 'sixteenth', dots: 0 }, 0.25)];
  const reference = timeAttacks([note(0, half, 2), note(8, quarter, 1)], 1, 3, false)!;
  const timing = timeSparseVoice([...main.slice(0, 2), secondary, main[2]], 1, 3, reference);

  expect(timing?.timed.map(item => [item.attack, item.beat, item.voice])).toEqual([
    [main[0], 0, 0], [main[1], 2, 0], [secondary, 2, 1], [main[2], 2.75, 0],
  ]);
  expect(timeSparseVoice([...main.slice(0, 2), note(10.35, quarter, 1, false, 2.5), main[2]],
    1, 3, reference)).toBeNull();
});

test('places two independently anchored attacks with an omitted intermediate rest', () => {
  const eighth = { value: 'eighth', dots: 0 } as const;
  const main = [0, 2, 4, 6, 8, 10].map(x => note(x, eighth, 1 / 3));
  const first = note(0, eighth, 0.5, false);
  const last = note(6, quarter, 1, false);
  const reference = timeAttacks([note(0, quarter, 1), note(6, quarter, 1)], 1, 2, false)!;
  const withSecondary = [...main, first, last].sort((a, b) => a.x - b.x);
  expect(timeSparseVoice(withSecondary, 1, 2, reference)?.timed.filter(item => item.voice === 1)).toEqual([
    { attack: first, beat: 0, voice: 1 }, { attack: last, beat: 1, voice: 1 },
  ]);
  expect(timeSparseVoice(withSecondary, 1, 2, {
    ...reference, timed: reference.timed.slice(0, 1),
  })).toBeNull();
});

test('places a secondary rest and note underneath a sustained primary note', () => {
  const eighth = { value: 'eighth', dots: 0 } as const;
  const primary = [note(0, quarter, 1), note(4, half, 2)];
  const reference = timeAttacks(primary, 1, 3, false)!;
  const rest = { ...note(4, { value: 'quarter', dots: 1 }, 1.5), heads: [], rest: primary[0].heads[0] };
  const last = note(8, eighth, 0.5, false);
  const reading = timeSparseVoice([...primary, rest, last], 1, 3, reference);
  expect(reading?.timed.filter(t => t.voice === 1).map(t => [t.attack, t.beat])).toEqual([[rest, 1], [last, 2.5]]);
  expect(timeSparseVoice([...primary, rest, { ...last, beats: 1 }], 1, 3, reference)).toBeNull();
});

test('reads a measured cue after hidden rests at the end of a bar', () => {
  const cueGlyph = (x: number, text: string) => ({ x, y: 2, text, code: text.codePointAt(0)!, size: 2.8, font: 'MScore' });
  const rest = cueGlyph(6, '\ue4e6');
  const head = cueGlyph(8, '\ue0a4');
  const flag = { ...cueGlyph(8.04, '\ue241'), y: -0.5 };
  const geometry = { glyphs: [rest, head, flag], fills: [], curvedFills: [],
    segments: [{ x1: 8.04, x2: 8.04, y1: -0.5, y2: 1.9, width: 0.1 }] };
  const line = [note(0, half, 2), note(4, half, 2)];
  const cues = measuredCueGlyphs(geometry.glyphs, 1);
  expect(measuredCueGlyphs([head, flag], 1)).toEqual([]);
  expect(readCueTiming(geometry, cues, { bottom: 0, space: 1 }, line, 4)?.timed
    .filter(t => t.voice === 1).map(t => [t.beat, t.attack.beats])).toEqual([[3, 0.5], [3.5, 0.5]]);
  expect(readCueTiming(geometry, cues, { bottom: 0, space: 1 }, [line[0]], 4)).toBeNull();
});

test('times a printed rest opposite a down-stem note and an omitted final rest', () => {
  const main = [note(0, quarter, 1), note(4, quarter, 1), note(8, quarter, 1)];
  const reference = timeAttacks(main, 1, 3, false)!;
  const rest: PianoAttack = { x: 0, duration: quarter, beats: 1, heads: [], beams: [], rest: main[0].heads[0] };
  const bass = [rest, note(0, half, 2, false), note(4, quarter, 1), note(8, quarter, 1, false)];
  expect(timeSparseVoice(bass, 1, 3, reference)?.timed.map(t => [t.beat, t.voice]))
    .toEqual([[0, 0], [0, 1], [1, 0], [2, 1]]);
  const wrong = { ...reference, timed: reference.timed.map(t => ({ ...t, beat: t.beat * 0.5 })) };
  expect(timeSparseVoice(bass, 1, 3, wrong)).toBeNull();
});

test('keeps a third voice separate when its first head displaces a held note', () => {
  const main = [note(0, quarter, 1), note(4, quarter, 1), note(8, quarter, 1)];
  const reference = timeAttacks(main, 1, 3, false)!;
  const attacks = [main[0], note(0, half, 2, false), main[1], note(4.5, half, 2),
    main[2], note(8, quarter, 1, false)];
  const timed = timeSparseVoice(attacks, 1, 3, reference)?.timed;
  expect(timed?.filter(t => t.voice === 2).map(t => [t.attack, t.beat])).toEqual([[main[1], 1], [main[2], 2]]);
});

test('keeps an aligned rest in the upper voice over a beamed lower voice', () => {
  const lower = note(0, quarter, 1, false);
  const upper: PianoAttack = { x: 0, duration: quarter, beats: 1, heads: [], beams: [], rest: lower.heads[0] };
  expect(timeAttacks([lower, upper], 1, 1, false)?.timed.map(t => [t.attack, t.voice]))
    .toEqual([[upper, 0], [lower, 1]]);
});

test('rejects simultaneous attacks inside a presumed monophonic line beside a held chord', () => {
  const held = { ...note(0, half, 2), stem: undefined };
  const line = [note(1.8, quarter, 1, false), note(1.8, quarter, 1)];
  expect(timeAttacks([held, ...line], 1, 2, false)).toBeNull();
});

test('two staves can supply consecutive columns when their secondary voices omit rests', () => {
  const held = (x: number) => ({ ...note(x, { value: 'whole', dots: 0 }, 4), stem: undefined });
  const upper = [held(0), note(0, quarter, 1, false), note(4, quarter, 1, false)];
  const lower = [held(0), note(8, quarter, 1, true), note(8, quarter, 1, false),
    note(12, quarter, 1, true), note(12, quarter, 1, false)];
  const times = timePianoColumns([upper, lower], [null, null], 1, 4);
  expect(times?.map(t => t.timed.map(item => item.beat))).toEqual([[0, 0, 1], [0, 2, 2, 3, 3]]);
  expect(timePianoColumns([upper, lower.slice(0, -2)], [null, null], 1, 4)).toBeNull();
});
