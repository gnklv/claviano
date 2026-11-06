import { beatsOf } from '../metronome';
import type { Hand } from '../note';
import { SAME_MOMENT, sameMoment } from '../moment';
import type { WrittenNote } from '../notation/written';
import { hasPickup, timeSignatureAt, type Score } from '../score';
import type { Part } from './parts';

export type LayerKind = 'lead' | 'lead-bass' | 'lead-hand-bass' | 'full';
export interface VoiceRef { readonly staff: number; readonly voice: string }
export interface WrittenLayer { readonly kind: LayerKind; readonly notes: readonly number[]; readonly addedHand?: Hand }
export interface LayerDiagnostic {
  readonly kind: 'multiple-lead-voices' | 'left-hand-lead-fallback' | 'no-bass-pulses' | 'tie-across-boundary' | 'ornaments-present' | 'graces-present' | 'tremolo-present' | 'arpeggio-present';
  /** Zero-based printed bar indices, never the order bars are played in. */
  readonly bars: readonly number[];
}
export interface LayerCandidates {
  readonly part: Part;
  readonly lead: VoiceRef | null;
  readonly voices: readonly VoiceRef[];
  readonly layers: readonly WrittenLayer[];
  readonly diagnostics: readonly LayerDiagnostic[];
}

const voiceKey = ({ staff, voice }: VoiceRef): string => JSON.stringify([staff, voice]);
const compareVoices = (a: VoiceRef, b: VoiceRef): number => a.staff - b.staff || (a.voice < b.voice ? -1 : a.voice > b.voice ? 1 : 0);
const ordered = (indices: Iterable<number>): number[] => [...new Set(indices)].sort((a, b) => a - b);
const sameNotes = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((note, i) => note === b[i]);

/**
 * Written-note candidates for one valid, inclusive Part. This is a voice heuristic for a person
 * to inspect, not a judgement of which line is the melody. Reduced layers omit hidden/headless
 * notes; full preserves every source note. No notes are moved or performances made here.
 */
export function layersOf(score: Score, part: Part, options: { lead?: VoiceRef } = {}): LayerCandidates {
  if (!Number.isInteger(part.from) || !Number.isInteger(part.to) || part.from < 0 || part.to < part.from || part.to >= score.notation.bars.length) {
    throw new RangeError('A layer Part must contain valid printed bar indices from..to.');
  }
  const notes = score.notation.notes;
  const inPart = (note: { bar: number }): boolean => note.bar >= part.from && note.bar <= part.to;
  const full = notes.flatMap((note, index) => inPart(note) ? [index] : []);
  const visible = full.filter((i) => !notes[i]!.hidden && !notes[i]!.headless);
  const groups = new Map<string, number[]>();
  for (const i of full) {
    const key = voiceKey(notes[i]!);
    const group = groups.get(key) ?? [];
    group.push(i);
    groups.set(key, group);
  }
  const voices = [...groups.values()].map((group) => {
    const { staff, voice } = notes[group[0]!]!;
    return { staff, voice };
  }).sort(compareVoices);
  const visibleGroups = voices.map((ref) => ({ ref, indices: visible.filter((i) => voiceKey(notes[i]!) === voiceKey(ref)) })).filter((group) => group.indices.length > 0);
  const right = visibleGroups.filter((group) => group.indices.some((i) => notes[i]!.hand === 'right'));
  const candidates = right.length ? right : visibleGroups;
  const start = score.notation.bars[part.from]!.start;
  const last = score.notation.bars[part.to]!;
  const end = last.start + last.length;
  const ranked = candidates.map((group) => ({ ...group, coverage: coverageOf(notes, group.indices, start, end), median: medianOf(group.indices.map((i) => notes[i]!.sounding)) }))
    .sort((a, b) => Math.abs(b.coverage - a.coverage) > SAME_MOMENT ? b.coverage - a.coverage : b.median - a.median || compareVoices(a.ref, b.ref));
  let lead: VoiceRef | null = ranked[0]?.ref ?? null;
  if (options.lead) {
    lead = voices.find((ref) => voiceKey(ref) === voiceKey(options.lead!)) ?? null;
    if (!lead) throw new RangeError('The lead voice must exist in the Part.');
  }

  const diagnostics: LayerDiagnostic[] = [];
  const warn = (kind: LayerDiagnostic['kind'], bars: Iterable<number>) => {
    const unique = ordered(bars);
    if (unique.length) diagnostics.push({ kind, bars: unique });
  };
  if (right.length > 1) warn('multiple-lead-voices', right.flatMap((group) => group.indices.map((i) => notes[i]!.bar)));
  if (!options.lead && lead && !right.length) warn('left-hand-lead-fallback', (groups.get(voiceKey(lead)) ?? []).map((i) => notes[i]!.bar));

  const links = tieLinks(notes);
  const closeTies = (indices: readonly number[]): number[] => {
    const included = new Set(indices);
    const pending = [...indices];
    for (let i = 0; i < pending.length; i++) {
      const index = pending[i]!;
      for (const linked of [links.before.get(index), links.after.get(index)]) {
        if (linked === undefined || !inPart(notes[linked]!) || included.has(linked)) continue;
        included.add(linked);
        pending.push(linked);
      }
    }
    return ordered(included);
  };
  const incoming = (index: number): boolean => {
    const before = links.before.get(index);
    return before !== undefined && !inPart(notes[before]!);
  };
  // A line already sounding as the Part begins is still its lead; the preceding bar stays out.
  const leadSeeds = visible.filter((i) => lead && voiceKey(notes[i]!) === voiceKey(lead) && (!notes[i]!.tieStop || incoming(i)));
  const leadNotes = closeTies(extremeNotes(notes, leadSeeds, 'highest'));
  const left = notes.filter((note) => note.hand === 'left' && !note.hidden && !note.headless);
  // A higher accompaniment attack does not become the bass while a lower key is still held.
  // Use the whole page: a held bass can enter the fragment from the preceding bar.
  const lowerHeld = (note: WrittenNote): boolean => left.some((held) => held.sounding < note.sounding
    && held.beat <= note.beat + SAME_MOMENT && held.beat + held.beats > note.beat + SAME_MOMENT);
  const bassNotes = extremeNotes(notes, visible.filter((i) => notes[i]!.hand === 'left' && !notes[i]!.tieStop
    && onPulse(score, notes[i]!) && !lowerHeld(notes[i]!)), 'lowest');
  const leadBass = closeTies([...leadNotes, ...bassNotes]);
  const leadHands = new Set(visible.filter((i) => lead && voiceKey(notes[i]!) === voiceKey(lead)).map((i) => notes[i]!.hand));
  const addedHand = leadHands.size === 1 ? [...leadHands][0]! : null;
  const handNotes = addedHand ? closeTies([...leadBass, ...visible.filter((i) => notes[i]!.hand === addedHand)]) : [];
  const bassSet = new Set(leadBass);
  const handLayer: WrittenLayer[] = addedHand && handNotes.every((i) => bassSet.has(i) || notes[i]!.hand === addedHand)
    ? [{ kind: 'lead-hand-bass', addedHand, notes: handNotes }] : [];
  if (visible.some((i) => notes[i]!.hand === 'left') && !bassNotes.length) {
    warn('no-bass-pulses', visible.filter((i) => notes[i]!.hand === 'left').map((i) => notes[i]!.bar));
  }
  warn('tie-across-boundary', full.filter((i) => [links.before.get(i), links.after.get(i)].some((linked) => linked !== undefined && !inPart(notes[linked]!))).map((i) => notes[i]!.bar));
  warn('ornaments-present', full.filter((i) => notes[i]!.ornaments.length || notes[i]!.trillLine).map((i) => notes[i]!.bar));
  warn('graces-present', score.notation.graces.filter(inPart).map((graces) => graces.bar));
  warn('tremolo-present', full.filter((i) => notes[i]!.tremolo).map((i) => notes[i]!.bar));
  warn('arpeggio-present', full.filter((i) => notes[i]!.arpeggio).map((i) => notes[i]!.bar));

  const layers: WrittenLayer[] = [];
  for (const layer of [{ kind: 'lead', notes: leadNotes }, { kind: 'lead-bass', notes: leadBass }, ...handLayer, { kind: 'full', notes: full }] as readonly WrittenLayer[]) {
    if (!layer.notes.length) continue;
    const duplicate = layers.findIndex((before) => sameNotes(before.notes, layer.notes));
    if (duplicate >= 0) {
      if (layer.kind === 'full') layers[duplicate] = layer;
    } else layers.push(layer);
  }
  return { part: { ...part }, lead, voices, layers, diagnostics };
}

/** A chord covers time once, however many notes share its stem. */
function coverageOf(notes: readonly WrittenNote[], indices: readonly number[], start: number, end: number): number {
  const intervals = indices.map((i) => ({ start: Math.max(start, notes[i]!.beat), end: Math.min(end, notes[i]!.beat + notes[i]!.beats) })).sort((a, b) => a.start - b.start);
  let until = start;
  let coverage = 0;
  for (const interval of intervals) {
    coverage += Math.max(0, interval.end - Math.max(until, interval.start));
    until = Math.max(until, interval.end);
  }
  return coverage;
}

function medianOf(pitches: number[]): number {
  pitches.sort((a, b) => a - b);
  const middle = Math.floor(pitches.length / 2);
  return pitches.length % 2 ? pitches[middle]! : (pitches[middle - 1]! + pitches[middle]!) / 2;
}

function extremeNotes(notes: readonly WrittenNote[], indices: readonly number[], direction: 'highest' | 'lowest'): number[] {
  const attacks = [...indices].sort((a, b) => notes[a]!.beat - notes[b]!.beat || a - b);
  const chosen: number[] = [];
  for (let i = 0; i < attacks.length;) {
    const first = notes[attacks[i]!]!;
    let best = attacks[i++]!;
    while (i < attacks.length && sameMoment(notes[attacks[i]!]!.beat, first.beat)) {
      const index = attacks[i++]!;
      const difference = notes[index]!.sounding - notes[best]!.sounding;
      if (direction === 'highest' ? difference > 0 : difference < 0) best = index;
    }
    chosen.push(best);
  }
  return ordered(chosen);
}

function onPulse(score: Score, note: WrittenNote): boolean {
  const bar = score.notation.bars[note.bar]!;
  const { count, length } = beatsOf(timeSignatureAt(score, bar.start));
  const offset = note.bar === 0 && hasPickup(score) ? Math.max(0, count * length - bar.length) : 0;
  const position = (note.beat - bar.start + offset) / length;
  const pulse = Math.round(position);
  return pulse >= 0 && pulse < count && sameMoment(note.beat, bar.start - offset + pulse * length);
}

/** Ties require a shared voice and sounding pitch, both signs, and continuous written time. */
function tieLinks(notes: readonly WrittenNote[]): { before: Map<number, number>; after: Map<number, number> } {
  const groups = new Map<string, number[]>();
  notes.forEach((note, index) => {
    if (!note.tieStart && !note.tieStop) return;
    const key = JSON.stringify([note.staff, note.voice, note.sounding]);
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  });
  const before = new Map<number, number>();
  const after = new Map<number, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => notes[a]!.beat - notes[b]!.beat || a - b);
    for (let i = 0; i < group.length; i++) {
      const index = group[i]!;
      const note = notes[index]!;
      if (!note.tieStart) continue;
      const end = note.beat + note.beats;
      for (let j = i + 1; j < group.length; j++) {
        const next = group[j]!;
        if (notes[next]!.beat > end + SAME_MOMENT) break;
        if (notes[next]!.tieStop && sameMoment(end, notes[next]!.beat) && !before.has(next)) {
          after.set(index, next);
          before.set(next, index);
          break;
        }
      }
    }
  }
  return { before, after };
}
