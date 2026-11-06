import { sameMoment } from '../moment';
import type { Score } from '../score';
import type { WrittenNote } from '../notation/written';
import type { WrittenLayer } from './layers';
import type { Part } from './parts';

/**
 * Selects existing performed events by their written sources. Timings, expression, repeats,
 * pedals and the whole page stay in their original frame; ornaments are not simplified here.
 * A score made before source metadata existed must be read/transcribed again before projection.
 */
export function scoreForLayer(score: Score, part: Part, layer: WrittenLayer): Score {
  if (!Number.isInteger(part.from) || !Number.isInteger(part.to) || part.from < 0 || part.to < part.from || part.to >= score.notation.bars.length) {
    throw new RangeError('A layer Part must contain valid printed bar indices from..to.');
  }
  const inPart = (bar: number): boolean => bar >= part.from && bar <= part.to;
  const selected = new Set(layer.notes);
  for (const index of selected) {
    if (!validIndex(index, score.notation.notes.length) || !inPart(score.notation.notes[index]!.bar)) {
      throw new RangeError('Every layer note must be a written note in its Part.');
    }
  }
  if (layer.kind === 'full' && selected.size !== score.notation.notes.filter((note) => inPart(note.bar)).length) {
    throw new RangeError('A full layer must contain every written note in its Part.');
  }
  for (const note of score.notes) {
    if (!Array.isArray(note.sources) || note.sources.length === 0) {
      throw new Error('Layer projection requires source metadata for every performed note.');
    }
    if (!note.sources.every((source) => validSource(score, source))) {
      throw new RangeError('A performed note has an invalid written source.');
    }
  }

  const graces = new Set<number>();
  score.notation.graces.forEach((group, index) => {
    if (!inPart(group.bar)) return;
    if (group.leadsTo === null) {
      if (layer.kind === 'full') graces.add(index);
    } else if (chordSelected(score.notation.notes, group.leadsTo, selected)) graces.add(index);
  });
  return {
    ...score,
    notes: score.notes.filter((note) => note.sources!.some((source) => source.kind === 'note' ? selected.has(source.index) : graces.has(source.group))),
  };
}

const validIndex = (index: unknown, count: number): index is number => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < count;

function validSource(score: Score, source: unknown): boolean {
  if (!source || typeof source !== 'object' || !('kind' in source) || !('index' in source)) return false;
  if (source.kind === 'note') return validIndex(source.index, score.notation.notes.length);
  if (source.kind !== 'grace' || !('group' in source) || !validIndex(source.group, score.notation.graces.length)) return false;
  return validIndex(source.index, score.notation.graces[source.group]!.notes.length);
}

/** A grace leads to the chord sharing its stem, not to every voice sounding at the same time. */
function chordSelected(notes: readonly WrittenNote[], anchor: number, selected: ReadonlySet<number>): boolean {
  if (!validIndex(anchor, notes.length)) throw new RangeError('A grace group has an invalid written anchor.');
  const first = notes[anchor]!;
  const together = (note: WrittenNote): boolean => note.bar === first.bar && note.staff === first.staff && note.voice === first.voice && sameMoment(note.beat, first.beat);
  let from = anchor;
  while (from > 0 && notes[from]!.chord && together(notes[from - 1]!)) from--;
  let to = anchor;
  while (to + 1 < notes.length && notes[to + 1]!.chord && together(notes[to + 1]!)) to++;
  for (let i = from; i <= to; i++) if (selected.has(i)) return true;
  return false;
}
