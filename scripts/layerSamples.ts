import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { layersOf, type LayerCandidates, type LayerKind } from '../src/domain/practice/layers';
import { scoreForLayer } from '../src/domain/practice/layerScore';
import { partsOf } from '../src/domain/practice/parts';
import { writtenBarNumber, type Score } from '../src/domain/score';
import { MidiFileParser } from '../src/infrastructure/parsers/MidiFileParser';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';

export interface SamplePart {
  readonly bars: readonly [number, number];
  readonly candidates: LayerCandidates;
  readonly violations: readonly string[];
  /** Original performed events across every occurrence of the selected written bars. */
  readonly previews: readonly { readonly kind: LayerKind; readonly events: number; readonly graces: number }[];
}

export interface SampleNotes {
  readonly index: number;
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly pitch: number;
  readonly staff: number;
  readonly voice: string;
  readonly hand: string;
  readonly tieStart: boolean;
  readonly tieStop: boolean;
}

export type SampleResult = {
  readonly file: string;
  readonly status: 'ok';
  readonly title: string;
  readonly source: 'written' | 'inferred';
  readonly notes: readonly SampleNotes[];
  readonly graceNotes: number;
  readonly parts: readonly SamplePart[];
} | {
  readonly file: string;
  readonly status: 'error';
  readonly error: string;
};

export interface LayerSampleReport {
  readonly version: 1;
  readonly files: readonly SampleResult[];
  readonly summary: {
    readonly files: number;
    readonly parsed: number;
    readonly failed: number;
    readonly fragments: number;
    readonly violations: number;
    readonly diagnostics: Readonly<Record<string, number>>;
  };
}

/** Inspects local scores without changing or redistributing them. */
export async function inspectLayerSamples(directory: string): Promise<LayerSampleReport> {
  const parsers = [new MusicXmlParser(), new MidiFileParser()];
  const names = (await filesIn(directory)).filter((name) => parsers.some((parser) => parser.canParse(name))).sort();
  if (!names.length) throw new Error(`No supported scores in ${directory}`);
  const files: SampleResult[] = [];
  const summary = { files: names.length, parsed: 0, failed: 0, fragments: 0, violations: 0, diagnostics: {} as Record<string, number> };
  for (const file of names) {
    try {
      const bytes = await readFile(join(directory, file));
      const parser = parsers.find((candidate) => candidate.canParse(file))!;
      const score = parser.parse(new Uint8Array(bytes).buffer, file);
      const parts = partsOf(score).map((part): SamplePart => {
        const candidates = layersOf(score, part);
        const violations = violationsOf(score, candidates);
        const originalNotes = new Set(score.notes);
        const previews = candidates.layers.map((layer) => {
          const projected = scoreForLayer(score, part, layer);
          if (projected.notes.some((note) => !originalNotes.has(note))) violations.push(`${layer.kind}: performed event was changed`);
          if (projected.duration !== score.duration || projected.timeMap !== score.timeMap || projected.bars !== score.bars
            || projected.pedal !== score.pedal || projected.notation !== score.notation) violations.push(`${layer.kind}: original timeline or notation was changed`);
          return { kind: layer.kind, events: projected.notes.length,
            graces: projected.notes.filter((note) => note.sources?.some((source) => source.kind === 'grace')).length };
        });
        return { bars: [writtenBarNumber(score, part.from), writtenBarNumber(score, part.to)], candidates, violations, previews };
      });
      files.push({
        file, status: 'ok', title: score.title,
        source: parser instanceof MidiFileParser ? 'inferred' : 'written',
        notes: score.notation.notes.map((note, index) => ({ index, bar: note.bar, beat: note.beat, beats: note.beats,
          pitch: note.sounding, staff: note.staff, voice: note.voice, hand: note.hand, tieStart: note.tieStart, tieStop: note.tieStop })),
        graceNotes: score.notation.graces.reduce((count, group) => count + group.notes.length, 0),
        parts,
      });
      summary.parsed++;
      summary.fragments += parts.length;
      for (const part of parts) {
        summary.violations += part.violations.length;
        for (const diagnostic of part.candidates.diagnostics) {
          summary.diagnostics[diagnostic.kind] = (summary.diagnostics[diagnostic.kind] ?? 0) + 1;
        }
      }
    } catch (error) {
      summary.failed++;
      files.push({ file, status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { version: 1, files, summary };
}

/** Follow directories, not links: an unrelated collection outside this folder is not part of the run. */
async function filesIn(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await filesIn(directory, name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

/** Structural checks only. A coherent melody cannot be established by set inclusion. */
function violationsOf(score: Score, { part, layers }: LayerCandidates): string[] {
  const full = score.notation.notes.flatMap((note, index) => note.bar >= part.from && note.bar <= part.to ? [index] : []);
  const allowed = new Set(full);
  const violations: string[] = [];
  let previous: readonly number[] = [];
  for (const layer of layers) {
    const selected = new Set(layer.notes);
    if (layer.notes.some((index) => !allowed.has(index))) violations.push(`${layer.kind}: note outside the fragment`);
    if (selected.size !== layer.notes.length || layer.notes.some((index, i) => i > 0 && index <= layer.notes[i - 1]!)) violations.push(`${layer.kind}: unordered or duplicate indices`);
    if (!layer.notes.length || layer.notes.length <= previous.length) violations.push(`${layer.kind}: empty or redundant step`);
    if (previous.some((index) => !selected.has(index))) violations.push(`${layer.kind}: loses an earlier note`);
    previous = layer.notes;
  }
  if (full.length && (layers.at(-1)?.kind !== 'full' || previous.length !== full.length || full.some((index, i) => previous[i] !== index))) {
    violations.push('full: does not contain every written note in the fragment');
  }
  return violations;
}
