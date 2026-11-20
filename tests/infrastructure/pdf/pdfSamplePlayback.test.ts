// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Score } from '../../../src/domain/score';
import { playedFingers } from '../../../src/domain/fingering/own';
import { engrave } from '../../../src/domain/notation/engraving';
import { PdfScoreParser } from '../../../src/infrastructure/parsers/PdfScoreParser';
import { MusicXmlParser } from '../../../src/infrastructure/parsers/MusicXmlParser';

function attacks(score: Score) {
  return score.notes.map(({ pitch, hand, beat, beats }) => [pitch, hand, beat.toFixed(8), beats.toFixed(8)].join('/')).sort();
}

for (const file of [
  'clint-mansell-requiem-for-a-dream-pianistos',
  'cogwork-dancers-christopher-larkin',
  'comptine-dun-autre-ete-yann-tiersen-yann-tiersen-comptine-dun-autre-ete',
  'directed-by-robert-b-weide-from-curb-your-enthusiasm-frolic-by-luciano-michelini',
  'giornos-theme-il-vento-doro-jojos-bizarre-adventure-golden-wind-ost',
  'hit-the-road-jack',
  'lumiere-expedition-33',
  'married-life-michael-giacchino',
  'la-valse-damelie-yann-tiersen-la-valse-d-amelie',
  'severance-original-series-piano-theme',
  'still-dre-variation-composition',
  'tango-por-una-cabeza',
  'the-pink-panther-theme-henry-mancini-complete-song-piano',
  'sadness-and-sorrow-for-piano-solo',
]) {
  const pdf = `samples/${file}.pdf`, mxl = `samples/${file}.mxl`;
  test.skipIf(!existsSync(pdf) || !existsSync(mxl))(`opens and plays the complete local edition of ${file}`, () => {
    const actual = new PdfScoreParser().parse(Uint8Array.from(readFileSync(pdf)).buffer, file);
    const expected = new MusicXmlParser().parse(Uint8Array.from(readFileSync(mxl)).buffer, file);
    expect(actual.barWritten).toEqual(expected.barWritten);
    expect(attacks(actual)).toEqual(attacks(expected));
  });
}

const requiem = 'samples/clint-mansell-requiem-for-a-dream-pianistos';
test.skipIf(!existsSync(requiem + '.pdf') || !existsSync(requiem + '.mxl'))(
  'retains the raised bass-staff rests and the written bass octaves under the Requiem 8va',
  () => {
    const pdf = new PdfScoreParser().parse(Uint8Array.from(readFileSync(requiem + '.pdf')).buffer, requiem);
    const xml = new MusicXmlParser().parse(Uint8Array.from(readFileSync(requiem + '.mxl')).buffer, requiem);
    const bassRests = pdf.notation.rests.filter(rest => rest.staff === 2 && [40, 42, 48, 50, 56, 58].includes(rest.beat));
    expect(bassRests.map(({ beat, displayPitch }) => [beat, displayPitch])).toEqual(
      [40, 42, 48, 50, 56, 58].map(beat => [beat, { letter: 3, octave: 3 }]),
    );
    expect(bassRests).toEqual(xml.notation.rests.filter(rest => rest.staff === 2 && [40, 42, 48, 50, 56, 58].includes(rest.beat)));
    for (const score of [pdf, xml]) {
      const bass = score.notation.notes.filter(note => note.staff === 2 && note.beats === 2 && [56, 58].includes(note.beat));
      expect(bass.map(({ beat, pitch, sounding }) => [beat, pitch, sounding])).toEqual([
        [56, { letter: 2, octave: 2, alteration: -1 }, 51],
        [56, { letter: 2, octave: 3, alteration: -1 }, 63],
        [58, { letter: 1, octave: 2, alteration: 0 }, 50],
        [58, { letter: 1, octave: 3, alteration: 0 }, 62],
      ]);
    }
  },
);

const severance = 'samples/severance-original-series-piano-theme.pdf';
test.skipIf(!existsSync(severance))('keeps the twelve printed Severance slurs on their ending notes', () => {
  const score = new PdfScoreParser().parse(Uint8Array.from(readFileSync(severance)).buffer, severance);
  const layout = engrave(score);
  // In these phrases the printed curves reach the head after the reference MusicXML stop.
  const endpoints = [
    [50.5, 51.5], [58.5, 59.5], [61.5, 63],
    [66.5, 67.5], [74.5, 75.5], [77.5, 79],
    [114.5, 115.5], [122.5, 123.5], [125.5, 127],
    [130.5, 131.5], [138.5, 139.5], [141.5, 143],
  ];
  const starts = new Set(endpoints.map(([start]) => start));
  expect(layout.slurs.flatMap(({ from, to, above }) => {
    const start = layout.chords[from];
    return start.staff === 'treble' && starts.has(start.beat)
      ? [{ start: start.beat, stop: layout.chords[to].beat, above }]
      : [];
  }).sort((a, b) => a.start - b.start)).toEqual(endpoints.map(([start, stop]) => ({ start, stop, above: true })));
});

const entertainer = 'samples/the-entertainer-scott-joplin-1902';
test.skipIf(!existsSync(entertainer + '.pdf') || !existsSync(entertainer + '.mxl'))(
  'applies the printed Entertainer ottava to all three heads of each chord',
  () => {
    const actual = new PdfScoreParser().parse(Uint8Array.from(readFileSync(entertainer + '.pdf')).buffer, entertainer);
    const expected = new MusicXmlParser().parse(Uint8Array.from(readFileSync(entertainer + '.mxl')).buffer, entertainer);
    expect(actual.barWritten).toEqual(expected.barWritten);
    // The reference raises only the top note of each chord. The printed line spans the staff.
    const pitches = [
      { beat: 103.25, printed: [76, 84, 88], reference: [64, 72, 76] },
      { beat: 103.5, printed: [77, 86, 89], reference: [65, 74, 77] },
      { beat: 103.75, printed: [78, 87, 90], reference: [66, 75, 78] },
    ];
    for (const { beat, printed, reference } of pitches) {
      const chord = (score: Score) => score.notes.filter(note => note.hand === 'right' && note.beat === beat)
        .sort((a, b) => a.pitch - b.pitch).map(note => [note.pitch, note.beats]);
      expect(chord(actual)).toEqual(printed.map(pitch => [pitch, 0.25]));
      expect(chord(expected)).toEqual(reference.map(pitch => [pitch, 0.25]));
    }
    const otherAttacks = (score: Score) => attacks({
      ...score,
      notes: score.notes.filter(note => note.hand !== 'right' || !pitches.some(({ beat }) => beat === note.beat)),
    });
    expect(otherAttacks(actual)).toEqual(otherAttacks(expected));
  },
);

const merry = 'merry-go-round-of-life-howls-moving-castle-piano-tutorial';
const merryPdf = `samples/${merry}.pdf`, merryMxl = `samples/${merry}.mxl`;
test.skipIf(!existsSync(merryPdf) || !existsSync(merryMxl))('plays the Merry-Go-Round PDF ties, tremolo and printed cross-staff arpeggio', () => {
  const actual = new PdfScoreParser().parse(Uint8Array.from(readFileSync(merryPdf)).buffer, merry);
  const reference = new MusicXmlParser().parse(Uint8Array.from(readFileSync(merryMxl)).buffer, merry);
  expect(actual.barWritten).toEqual(reference.barWritten);

  // The PDF engraves one continuous wavy line across both staves. The
  // MusicXML has the arpeggiate mark on the upper staff alone.
  const rolledPitches = new Set([47, 52, 59, 64, 68, 71]);
  const inRoll = ({ beat, pitch }: Score['notes'][number]) => beat >= 700 && beat < 701 && rolledPitches.has(pitch);
  const playedRoll = actual.notes.filter(inRoll).map(({ beat, beats, hand, pitch }) => [beat, beats, hand, pitch]);
  expect(playedRoll).toEqual([47, 52, 59, 64, 68, 71].map((pitch, order) => {
    const delay = (order + 1) / 16;
    return [700 + delay, 12 - delay, order < 2 ? 'left' : 'right', pitch];
  }));
  expect(attacks({ ...actual, notes: actual.notes.filter(note => !inRoll(note)) }))
    .toEqual(attacks({ ...reference, notes: reference.notes.filter(note => !inRoll(note)) }));
});

const valse = 'samples/la-valse-damelie-yann-tiersen-la-valse-d-amelie';
test.skipIf(!existsSync(valse + '.pdf') || !existsSync(valse + '.mxl'))(
  'opens all La Valse phrases with the printed side across measures 85–87',
  () => {
    const pdf = new PdfScoreParser().parse(Uint8Array.from(readFileSync(valse + '.pdf')).buffer, valse);
    const xml = new MusicXmlParser().parse(Uint8Array.from(readFileSync(valse + '.mxl')).buffer, valse);
    const phrases = (score: Score) => {
      const { chords, slurs } = engrave(score);
      return slurs.map(({ from, to, above }) => ({
        staff: chords[from].staff, start: chords[from].beat, end: chords[to].beat, above,
      }));
    };
    const expected = phrases(xml);
    expect(expected).toContainEqual({ staff: 'treble', start: 220, end: 226, above: false });
    expect(phrases(pdf)).toEqual(expected.map(phrase =>
      phrase.staff === 'treble' && phrase.start === 220 && phrase.end === 226 ? { ...phrase, above: true } : phrase));
  },
);

const pink = 'samples/the-pink-panther-theme-henry-mancini-complete-song-piano';
test.skipIf(!existsSync(pink + '.pdf') || !existsSync(pink + '.mxl'))(
  'preserves coincident Pink Panther phrases and the printed ending in measure 41',
  () => {
    const pdf = new PdfScoreParser().parse(Uint8Array.from(readFileSync(pink + '.pdf')).buffer, pink);
    const xml = new MusicXmlParser().parse(Uint8Array.from(readFileSync(pink + '.mxl')).buffer, pink);
    const spans = (score: Score) => {
      const { chords, slurs } = engrave(score);
      return slurs.map(({ from, to }) => [chords[from].staff, chords[from].beat, chords[to].beat].join('/')).sort();
    };
    const expected = spans(xml);
    expect(expected.filter(s => s === 'treble/47.5/48')).toHaveLength(2);
    expect(expected).toContain('treble/240/240.1875');
    expect(spans(pdf)).toEqual(expected.map(s => s === 'treble/240/240.1875' ? 'treble/240/240.375' : s).sort());
  },
);

test.skipIf(!existsSync(requiem + '.pdf') || !existsSync(requiem + '.mxl'))(
  'preserves all 29 printed Requiem finger numbers on their keys and on each played pass',
  () => {
    const pdf = new PdfScoreParser().parse(Uint8Array.from(readFileSync(requiem + '.pdf')).buffer, requiem);
    const xml = new MusicXmlParser().parse(Uint8Array.from(readFileSync(requiem + '.mxl')).buffer, requiem);
    const marks = (score: Score) => score.notation.notes.flatMap(n => n.fingering
      ? [{ bar: n.bar, staff: n.staff, beat: n.beat, pitch: n.sounding, ...n.fingering }] : []);
    const expected = marks(xml);
    expect(expected).toHaveLength(29);
    expect(expected.every(mark => mark.below === null)).toBe(true);
    expect(marks(pdf)).toEqual(expected.map(mark => ({ ...mark, below: false })));
    const played = (score: Score) => playedFingers(score).flatMap((mark, index) => mark
      ? [[score.notes[index].beat, score.notes[index].pitch, score.notes[index].hand, mark.text]] : []);
    expect(played(pdf)).toEqual(played(xml));
    expect(played(pdf).length).toBeGreaterThanOrEqual(29);
  },
);
