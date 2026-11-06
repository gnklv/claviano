// @vitest-environment happy-dom
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectLayerSamples } from '../scripts/layerSamples';
import { MidiFileWriter } from '../src/infrastructure/writers/MidiFileWriter';
import { attributes, note, parser, score } from './musicXmlScore';
import { zip } from './zipWriter';

const folders: string[] = [];
async function folder() {
  const path = await mkdtemp(join(tmpdir(), 'claviano-layers-'));
  folders.push(path);
  return path;
}
afterEach(async () => { await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const piece = () => score(`<measure number="1">${attributes()}${note('E', 5, 8)}
  <backup><duration>8</duration></backup>${note('C', 3, 2, { staff: 2 })}
  ${note('G', 3, 2, { staff: 2 })}${note('C', 3, 4, { staff: 2 })}</measure>`);

describe('the local collection of layer candidates', () => {
  it('reads every supported file, including nested files and alternate formats, without changing them', async () => {
    const directory = await folder();
    await mkdir(join(directory, 'nested'));
    const xml = new Uint8Array(piece());
    await writeFile(join(directory, 'plain.musicxml'), xml);
    await writeFile(join(directory, 'nested', 'copy.MXL'), new Uint8Array(zip([{ name: 'score.xml', data: xml }])));
    await writeFile(join(directory, 'ignore.txt'), 'Not a score');
    const report = await inspectLayerSamples(directory);
    expect(report.summary).toMatchObject({ files: 2, parsed: 2, failed: 0, fragments: 2, violations: 0 });
    expect(report.files.map((file) => file.file)).toEqual(['nested/copy.MXL', 'plain.musicxml']);
    const first = report.files[0];
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error(first.error);
    expect(first.source).toBe('written');
    expect(first.parts[0].candidates.layers.at(-1)?.kind).toBe('full');
    expect(first.parts[0].violations).toEqual([]);
    expect(first.parts[0].previews).toEqual([
      { kind: 'lead', events: 1, graces: 0 },
      { kind: 'full', events: 4, graces: 0 },
    ]);
    expect(first.notes).toHaveLength(4);
    expect(new Uint8Array(await readFile(join(directory, 'plain.musicxml')))).toEqual(xml);
    expect(await inspectLayerSamples(directory)).toEqual(report);
  });

  it('reports a broken file and continues to the next piece', async () => {
    const directory = await folder();
    await writeFile(join(directory, 'a-broken.musicxml'), '<not-a-score/>');
    await writeFile(join(directory, 'z-good.xml'), new Uint8Array(piece()));
    const report = await inspectLayerSamples(directory);
    expect(report.summary).toMatchObject({ files: 2, parsed: 1, failed: 1, fragments: 1 });
    expect(report.files[0]).toMatchObject({ file: 'a-broken.musicxml', status: 'error' });
    const broken = report.files[0];
    if (broken.status !== 'error') throw new Error('The broken score was accepted');
    expect(broken.error.length).toBeGreaterThan(0);
    expect(report.files[1].status).toBe('ok');
  });

  it('labels MIDI voices as inferred instead of treating them as written voices', async () => {
    const directory = await folder();
    const parsed = parser.parse(piece(), 'Example');
    const midi = new MidiFileWriter().write(parsed);
    await writeFile(join(directory, 'piece.mid'), new Uint8Array(midi));
    const report = await inspectLayerSamples(directory);
    expect(report.summary.failed).toBe(0);
    expect(report.files[0]).toMatchObject({ status: 'ok', source: 'inferred' });
    const result = report.files[0];
    if (result.status !== 'ok') throw new Error(result.error);
    expect(result.parts.every((part) => part.previews.every((preview) => !('plainEvents' in preview) && !('plainGraces' in preview)))).toBe(true);
  });

  it('checks a grace-delayed trill in every layer while retaining the original report counts', async () => {
    const directory = await folder();
    const decorated = score(`<measure number="1">${attributes()}
      <note><grace/><pitch><step>D</step><octave>5</octave></pitch><type>eighth</type><staff>1</staff></note>
      ${note('E', 5, 8, { extra: '<notations><ornaments><trill-mark/></ornaments></notations>' })}
      <backup><duration>8</duration></backup>${note('C', 3, 2, { staff: 2 })}
      ${note('G', 3, 2, { staff: 2 })}${note('C', 3, 4, { staff: 2 })}</measure>`);
    await writeFile(join(directory, 'decorated.musicxml'), new Uint8Array(decorated));
    const report = await inspectLayerSamples(directory);
    expect(report.summary).toMatchObject({ parsed: 1, failed: 0, fragments: 1, violations: 0 });
    const result = report.files[0];
    if (result.status !== 'ok') throw new Error(result.error);
    expect(result.graceNotes).toBe(1);
    expect(result.parts[0].previews).toEqual([
      { kind: 'lead', events: 16, graces: 1, plainEvents: 1, plainGraces: 0 },
      { kind: 'full', events: 19, graces: 1, plainEvents: 4, plainGraces: 0 },
    ]);
  });

  it('does not present a missing or empty collection as a successful run', async () => {
    const directory = await folder();
    await expect(inspectLayerSamples(directory)).rejects.toThrow(/No supported/);
    await expect(inspectLayerSamples(join(directory, 'missing'))).rejects.toThrow();
  });

  it('runs from the command line without a listening server and writes both reports', async () => {
    const directory = await folder();
    const output = join(await folder(), 'report');
    await writeFile(join(directory, 'piece.musicxml'), new Uint8Array(piece()));
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ['scripts/layers.mjs', directory, output]);
    expect(stderr).toBe('');
    expect(stdout).toContain('1/1 files analysed');
    expect(await readFile(join(output, 'report.md'), 'utf8')).toContain('## piece.musicxml');
    expect(JSON.parse(await readFile(join(output, 'report.json'), 'utf8'))).toMatchObject({ summary: { files: 1, failed: 0 } });
  }, 15_000);

  it('returns a failing command status while preserving a report of the remaining files', async () => {
    const directory = await folder();
    const output = join(await folder(), 'report');
    await writeFile(join(directory, 'broken.mxl'), 'Broken archive');
    await writeFile(join(directory, 'good.musicxml'), new Uint8Array(piece()));
    await expect(promisify(execFile)(process.execPath, ['scripts/layers.mjs', directory, output])).rejects.toMatchObject({ code: 1 });
    expect(JSON.parse(await readFile(join(output, 'report.json'), 'utf8'))).toMatchObject({ summary: { files: 2, parsed: 1, failed: 1 } });
  }, 15_000);
});
