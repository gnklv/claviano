// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { PACE_DEPTHS, paceWords, ritardando } from '../src/domain/notation/pace';
import type { Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';

/*
 * Changes of pace in words: "rit.", "riten.", "accel.", "a tempo". Pieces here are bars of four
 * quarter notes at 60 a minute, so a note lasts a second until the pace changes.
 */

const said = (text: string) => `<direction><direction-type><words>${text}</words></direction-type></direction>`;
const tempo = (bpm: number) => `<direction><direction-type><words>T</words></direction-type><sound tempo="${bpm}"/></direction>`;
const quarter = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>';

/** `bars`: for each bar, what stands before each of its four quarter notes ('' for nothing). */
function piece(bars: string[][]): Score {
  const measures = bars.map(
    (before, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${tempo(60)}` : ''}${[0, 1, 2, 3].map((q) => (before[q] ?? '') + quarter).join('')}</measure>`,
  );
  const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
  return new MusicXmlParser().parse(new TextEncoder().encode(xml).buffer, 'pace');
}
const plain = (count: number): string[][] => Array.from({ length: count }, () => []);
/** How long each note lasts until the next one is struck (the last: until the piece ends). */
const lengths = (score: Score): number[] => score.notes.map((note, i) => (score.notes[i + 1]?.start ?? score.duration) - note.start);

describe('paceWords', () => {
  it('knows the words for slowing down, holding back, speeding up and going back', () => {
    expect(['rit.', 'rit', 'ritard.', 'Ritardando', 'rall.', 'rallentando', 'molto rit.'].map((text) => paceWords(text)?.kind)).toEqual(Array(7).fill('slower'));
    expect(['riten.', 'ritenuto'].map((text) => paceWords(text)?.kind)).toEqual(['held', 'held']);
    expect(['accel.', 'accelerando', 'stringendo'].map((text) => paceWords(text)?.kind)).toEqual(Array(3).fill('faster'));
    expect(['a tempo', 'A tempo'].map((text) => paceWords(text)?.kind)).toEqual(['back', 'back']);
    expect(['Tempo I', 'tempo primo'].map((text) => paceWords(text)?.kind)).toEqual(['first', 'first']);
  });

  it('hears "poco" as a slighter change', () => {
    expect(paceWords('poco rit.')).toEqual({ kind: 'slower', slight: true });
    expect(paceWords('rit.')).toEqual({ kind: 'slower', slight: false });
  });

  it('takes other words for what they are', () => {
    expect(['tranquillo', 'rubato', 'Allegro', 'spirito', 'territory', 'a tempo giusto'.replace('a tempo ', '')].map(paceWords)).toEqual(Array(6).fill(null));
  });
});

describe('ritardando', () => {
  it('starts at the pace it had and ends at the pace asked for', () => {
    expect(ritardando(0, 0.5)).toBeCloseTo(1);
    expect(ritardando(1, 0.5)).toBeCloseTo(0.5);
  });

  it('slows hardly at first and most at the end, like a runner coming to a stop', () => {
    const pace = [0, 0.25, 0.5, 0.75, 1].map((x) => ritardando(x, 0.5));
    const drops = pace.slice(1).map((value, i) => pace[i] - value);
    expect(drops.every((drop, i) => i === 0 || drop > drops[i - 1])).toBe(true);
    // Half way through, about a third of the slowing down is done.
    expect((1 - pace[2]) / 0.5).toBeGreaterThan(0.3);
    expect((1 - pace[2]) / 0.5).toBeLessThan(0.4);
  });
});

describe('a piece with words of pace', () => {
  it('plays evenly without any', () => {
    expect(lengths(piece(plain(3))).every((length) => Math.abs(length - 1) < 1e-9)).toBe(true);
  });

  it('slows down to the end at "rit." near the end: each note longer than the one before, the slowest pace at the last note', () => {
    const score = piece([[], [said('rit.')], []]);
    const all = lengths(score);
    expect(all.slice(0, 4).every((length) => Math.abs(length - 1) < 1e-9)).toBe(true);
    const slowing = all.slice(4, 11);
    expect(slowing.every((length, i) => i === 0 || length > slowing[i - 1])).toBe(true);
    // The last step before the final note is nearly at the slowest pace.
    const slowest = 1 / PACE_DEPTHS.final;
    expect(slowing.at(-1)).toBeGreaterThan(slowest * 0.93);
    expect(slowing.at(-1)).toBeLessThan(slowest);
    // The final note is held longer than written, but not for as long as that pace would make it.
    expect(all.at(-1)).toBeGreaterThan(1.1);
    expect(all.at(-1)).toBeLessThan(slowest);
  });

  it('only breathes at "rit." in the middle: a little slower through the next bar, then the pace is back', () => {
    const score = piece([[], [said('rit.')], ...plain(12)]);
    const all = lengths(score);
    // Bars 2 and 3 slow down, less than at the end of a piece…
    expect(all.slice(4, 12).every((length) => length >= 1 - 1e-9 && length <= 1 / PACE_DEPTHS.passing + 1e-6)).toBe(true);
    expect(all[11]).toBeGreaterThan((1 / PACE_DEPTHS.passing) * 0.97);
    expect(PACE_DEPTHS.passing).toBeGreaterThan(PACE_DEPTHS.final);
    // …and from bar 4 on it is as before.
    expect(all.slice(12).every((length) => Math.abs(length - 1) < 1e-9)).toBe(true);
  });

  it('slows down until "a tempo", which gives the pace back', () => {
    const score = piece([[], [said('rit.')], [said('a tempo')], ...plain(11)]);
    const all = lengths(score);
    expect(all[7]).toBeGreaterThan(1.1);
    expect(all.slice(8).every((length) => Math.abs(length - 1) < 1e-9)).toBe(true);
  });

  it('slows down until the next tempo the piece sets', () => {
    const score = piece([[], [said('rit.')], [tempo(120)], ...plain(11)]);
    const all = lengths(score);
    expect(all[7]).toBeGreaterThan(1.1);
    expect(all.slice(8).every((length) => Math.abs(length - 0.5) < 1e-9)).toBe(true);
  });

  it('holds back at once at "riten.", and goes on slowing from there', () => {
    const rit = lengths(piece([[], [said('rit.')], []]));
    const riten = lengths(piece([[], [said('riten.')], []]));
    // The very first note under it is already slower by a tenth; under "rit." it is hardly touched.
    expect(riten[4]).toBeGreaterThan(1 / PACE_DEPTHS.held - 1e-6);
    expect(rit[4]).toBeLessThan(1.05);
    // Both end at the same pace.
    expect(Math.abs(riten.at(-2)! - rit.at(-2)!)).toBeLessThan(0.1);
  });

  it('slows down less at "poco rit."', () => {
    const whole = piece([[], [said('rit.')], []]).duration;
    const slight = piece([[], [said('poco rit.')], []]).duration;
    expect(slight).toBeGreaterThan(12);
    expect(slight).toBeLessThan(whole);
  });

  it('speeds up at "accel.", and "Tempo I" brings the first tempo back', () => {
    const score = piece([[], [said('accel.')], [said('Tempo I')], ...plain(11)]);
    const all = lengths(score);
    const faster = all.slice(4, 8);
    expect(faster.every((length, i) => length < 1 && (i === 0 || length < faster[i - 1]))).toBe(true);
    expect(faster.at(-1)).toBeGreaterThan(1 / PACE_DEPTHS.faster - 1e-6);
    expect(all.slice(8).every((length) => Math.abs(length - 1) < 1e-9)).toBe(true);
  });

  it('keeps the metronome and the bars with the notes: a bar under "rit." lasts as long as its notes', () => {
    const score = piece([[], [said('rit.')], []]);
    const all = lengths(score);
    expect(score.bars[2] - score.bars[1]).toBeCloseTo(all.slice(4, 8).reduce((sum, length) => sum + length, 0));
  });

  it('prints the words too', () => {
    const words = piece([[], [said('rit.')], []]).notation.words.filter((w) => !w.tempo);
    expect(words.map((w) => [w.text, w.beat])).toEqual([['rit.', 4]]);
  });
});
