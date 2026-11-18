/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

it('embeds the digest of the MusicXML used to engrave the public showcase', () => {
  const source = readFileSync(join(root, 'public/demos/showcase.musicxml'));
  const digest = createHash('sha256').update(source).digest('hex');
  const pdf = readFileSync(join(root, 'tests/fixtures/pdf/showcase.pdf'), 'latin1');
  // pypdf may encode punctuation in the subject as PDF octal escapes.
  const subject = /\/Subject\s*\(([^)]*)\)/.exec(pdf)?.[1]?.replace(/\\([0-7]{3})/g,
    (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
  expect(subject).toBe('MusicXML-SHA256: ' + digest);
});

it('checks the showcase against its reference without any private PDFs', () => {
  const temp = mkdtempSync(join(tmpdir(), 'claviano-public-pdf-'));
  try {
    const input = join(temp, 'empty');
    const output = join(temp, 'reports');
    mkdirSync(input);
    const runResult = spawnSync(process.execPath, [join(root, 'scripts/pdf-samples.mjs'), input, output], { encoding: 'utf8' });
    expect(runResult.error).toBeUndefined();
    const [run] = readdirSync(output);
    const reports = JSON.parse(readFileSync(join(output, run, 'report.json'), 'utf8')) as Array<{
      file: string;
      reference: { file: string; bars: number; notes: number };
      pages: Array<{ staffPairs: number }>;
      symbols: Array<{ name: string; expected: number; actual: number }>;
      closingBars: object[];
      directions: Array<{ text: string; beat: number; page: number }>;
      status: string;
      error?: string;
      preview: string;
      coverage: { barsRead: number; referenceBars: number; partial: boolean };
      playbackOrder: number[];
      printedDifferences: object[];
      inferredReferenceFingerings: object[];
      playbackOnly: object;
      issues: object[];
      inferredReferenceStems: Array<{ bar: number; beat: number; stem: string }>;
      comparison?: { differences: Record<string, unknown> };
    }>;
    expect(reports).toHaveLength(1);
    const [showcase] = reports;
    expect(showcase.file).toBe('showcase.pdf');
    expect(showcase.reference).toMatchObject({ file: 'showcase.musicxml', bars: 36, notes: 263 });
    expect(showcase.pages.reduce((sum, page) => sum + page.staffPairs, 0)).toBe(36);
    expect(showcase.symbols).toEqual(['double-sharp', 'double-flat', 'tuplet-5'].map(name => ({ name, expected: 1, actual: 1 })));
    expect(showcase.closingBars).toEqual([
      { bar: 33, meters: [null, null], groups: [[2, 2, 1, 1]], doubleDotted: [] },
      { bar: 34, meters: ['6/8', '6/8'], groups: [], doubleDotted: [{ staff: 1, kind: 'eighth rest' }] },
      { bar: 35, meters: ['7/8', '7/8'], groups: [[1, 1], [1, 1], [1, 1, 1]], doubleDotted: [{ staff: 2, kind: 'half note' }] },
    ]);
    expect(showcase.directions).toContainEqual({ text: 'Pickup', beat: 0, page: 1 });
    expect(showcase.coverage).toEqual({ barsRead: 36, referenceBars: 36, partial: false });
    expect(showcase.comparison).toMatchObject({ expectedNotes: 263, actualNotes: 263 });
    expect(showcase.playbackOrder).toEqual([
      ...Array.from({ length: 28 }, (_, i) => i), 28, 29, 28, 30, 31, 28, 30, 32, 33, 34, 35,
    ]);
    expect(showcase.inferredReferenceFingerings).toEqual([
      [98, 1, 74, '1'], [99, 1, 78, '3'], [100, 1, 81, '2'], [100, 1, 86, '5'], [101, 1, 83, '2-1'],
      [98, 2, 50, '5'], [99, 2, 57, '2'], [100, 2, 54, '3'],
    ].map(([beat, staff, sounding, text]) => ({ bar: 26, beat, staff, sounding, text, source: null, printed: 'above' })));
    expect(showcase.printedDifferences).toEqual([
      { bar: 30, field: 'endingLabel', source: '2.', printed: '2' },
      { bar: 32, field: 'pedalSign', beat: 122, source: true, printed: false },
      { bar: 32, field: 'pedalSign', beat: 126, source: true, printed: false },
    ]);
    expect(showcase.comparison?.differences).toEqual({});
    expect(showcase.status, showcase.error).toBe('matched-with-issues');
    expect(runResult.status, runResult.stderr).toBe(0);
    expect(showcase.issues).toEqual([{
      kind: 'ambiguous-pedal', staff: 2, bar: 18, start: 66, end: 70,
      referenceDifferences: {
        pedalMarks: [
          { pedal: 'sostenuto', beat: 66, type: 'start', sign: true, line: true },
          { pedal: 'sostenuto', beat: 70, type: 'stop', sign: true, line: true },
        ],
        pedalMoves: [
          { pedal: 'sostenuto', bar: 18, beat: 66, down: true },
          { pedal: 'sostenuto', bar: 18, beat: 70, down: false },
        ],
      },
    }]);
    expect(showcase.inferredReferenceStems.filter(({ bar }) => bar < 2)).toMatchObject([
      { beat: 0, stem: 'up' },
      { beat: 0.5, stem: 'up' },
      { beat: 1, stem: 'down' },
      { beat: 3, stem: 'down' },
      { beat: 4.5, stem: 'down' },
    ]);
    expect(showcase.playbackOnly).toMatchObject({
      tempo: { missing: [
        { beat: 0, perMinute: 90, printed: false },
        { beat: 43, perMinute: 60, printed: false },
        { beat: 46, perMinute: 90, printed: false },
      ], extra: [] },
      dynamics: { missing: [{ level: 70 }], extra: [] },
    });
    const xml = readFileSync(join(output, run, showcase.preview), 'utf8');
    expect(xml.match(/<measure\b[^>]*>/g)).toEqual([
      '<measure number="0" implicit="yes">',
      ...Array.from({ length: 35 }, (_, i) => `<measure number="${i + 1}">`),
    ]);
    const crossStaffBar = /<measure number="33">([\s\S]*?)<\/measure>/.exec(xml)?.[1] ?? '';
    const attacks = [...crossStaffBar.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(([, note]) => ({
      voice: /<voice>([^<]+)<\/voice>/.exec(note)?.[1],
      staff: /<staff>([^<]+)<\/staff>/.exec(note)?.[1],
    }));
    expect(new Set(attacks.map(note => note.voice))).toEqual(new Set(['1']));
    expect(attacks.map(note => note.staff)).toEqual(['2', '2', '1', '1', '1']);
    const ambiguousBar = /<measure number="18">([\s\S]*?)<\/measure>/.exec(xml)?.[1];
    expect(ambiguousBar).toMatch(/<words\b[^>]*>Sostenuto<\/words>/);
    expect(ambiguousBar).not.toMatch(/<pedal\b|(?:damper|sostenuto|soft)-pedal=/);
    const graceBar = /<measure number="20">([\s\S]*?)<\/measure>/.exec(xml)?.[1];
    expect(graceBar?.match(/<grace\b/g)).toHaveLength(5);
    expect(graceBar?.match(/<grace slash="yes"\/>/g)).toHaveLength(2);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
