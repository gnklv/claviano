import type { AttackTiming, TimedAttack } from './pianoAttackTiming';
import type { PianoAttack } from './pianoAttacks';
import { within } from './pianoGeometry';

interface Entry {
  attack: PianoAttack;
  staff: number;
}

function displaced(a: PianoAttack, b: PianoAttack, space: number): boolean {
  if (!a.heads.length || !b.heads.length || a.heads.length + b.heads.length < 4) return false;
  if (a.stem && b.stem && Math.min(a.heads.length, b.heads.length) < 2) return false;
  const dx = (b.x - a.x) / space;
  if (a.stem?.up && b.stem?.up === false && within(dx, 0.9, 0.08)) return true;
  return (within(dx, 1.6, 0.1) || within(dx, 1.8, 0.1))
    && a.heads.some(h => b.heads.some(k => within(h.y, k.y, space * 0.51)));
}

/** Shared horizontal columns supply clocks where one or both staves omit
 * rests. Chords colliding on a unison can occupy adjacent head columns. */
export function timePianoColumns(rows: PianoAttack[][], separate: (AttackTiming | null)[],
  space: number, length: number): AttackTiming[] | null {
  const groups = rows.flatMap((row, staff) => {
    const staffColumns: Entry[][] = [];
    for (const attack of row) {
      const previous = staffColumns.at(-1);
      const entry = { attack, staff };
      if (previous?.some(a => within(a.attack.x, attack.x, space * 0.17)
        || displaced(a.attack, attack, space))) previous.push(entry);
      else staffColumns.push([entry]);
    }
    return staffColumns;
  }).sort((a, b) => a[0]!.attack.x - b[0]!.attack.x);
  const columns: Entry[][] = [];
  for (const group of groups) {
    const previous = columns.at(-1);
    if (previous?.some(a => group.some(b => within(a.attack.x, b.attack.x, space * 0.17)))) previous.push(...group);
    else columns.push(group);
  }
  if (!columns.some(column => column.some((a, i) => column.slice(i + 1).some(b => a.staff === b.staff)))) return null;
  const anchors = new Map(separate.flatMap(row => row?.timed.map(item => [item.attack, item.beat] as const) ?? []));
  const result: AttackTiming[] = rows.map(() => ({ timed: [], length }));
  const ends = new Set<number>([0]);
  let previousBeat = -1;
  let nextBeat = 0;
  for (const column of columns) {
    const known = column.flatMap(({ attack }) => anchors.has(attack) ? [anchors.get(attack)!] : []);
    const beat = known[0] ?? nextBeat;
    if (!Number.isFinite(beat) || beat <= previousBeat + 1e-8 || known.some(value => !within(value, beat, 1e-8))
      || ![...ends].some(end => within(end, beat, 1e-8))) return null;
    previousBeat = beat;
    nextBeat = Math.min(...column.map(({ attack }) => beat + attack.beats));
    for (const { attack, staff } of column) {
      const end = beat + attack.beats;
      if (end > length + 1e-8) return null;
      ends.add(end);
      result[staff]!.timed.push({ attack, beat, voice: 0 });
    }
  }
  const last = columns.at(-1)!;
  if (!last.some(({ attack }) => within(previousBeat + attack.beats, length, 1e-8))) return null;
  for (const [staff, timing] of result.entries()) {
    const confirmed = separate[staff];
    if (confirmed) { result[staff] = confirmed; continue; }
    assignVoices(timing.timed, space);
    if (timing.timed.some(t => t.voice > 3)) return null;
  }
  return result;
}

function assignVoices(timed: TimedAttack[], space: number): void {
  const ends: number[] = [];
  const previous: (PianoAttack | undefined)[] = [];
  const hasPairedStems = timed.some(({ attack, beat }) => attack.stem?.up && timed.some(other =>
    within(other.beat, beat, 1e-8) && other.attack.stem?.up === false));
  const lowChords = timed.filter(({ attack }) => hasPairedStems && attack.heads.length >= 3
    && (attack.stem?.up || !attack.stem) && timed.some(other => other.attack.stem?.up === false
      && other.attack.heads.length >= 2 && Math.min(...other.attack.heads.map(h => h.y))
      >= Math.max(...attack.heads.map(h => h.y)) - space * 0.1));
  for (const item of timed) {
    const { attack, beat } = item;
    const continuing = previous.flatMap((p, i) => attack.tupletPart && attack.tupletPart !== 'start'
      && p?.tupletPart && p.tupletPart !== 'stop' && within(ends[i]!, beat, 1e-8) ? [i] : []);
    const continuation = continuing.find(i => previous[i]?.stem?.up === attack.stem?.up) ?? continuing[0] ?? -1;
    const afterTuplets = !attack.tupletPart && timed.some(t => t.attack.tupletPart)
      && timed.filter(t => t.beat >= beat - 1e-8).every(t => t.attack.stem?.up === attack.stem?.up && !t.attack.tupletPart);
    const preferred = continuation >= 0 ? continuation : lowChords.includes(item) ? 2
      : afterTuplets ? 0 : attack.stem ? Number(!attack.stem.up) : 0;
    let voice = preferred;
    if ((ends[voice] ?? 0) > beat + 1e-8) {
      voice = 0;
      while ((ends[voice] ?? 0) > beat + 1e-8) voice++;
    }
    item.voice = voice;
    ends[voice] = beat + attack.beats;
    previous[voice] = attack;
  }
}

/** In a polyphonic staff the upper line takes voice one. A whole note has
 * no stem, so the stems of the other line identify its voice. */
export function orderPrintedVoices(timing: AttackTiming): AttackTiming {
  const voices = [...new Set(timing.timed.map(t => t.voice))];
  if (voices.length < 2 || !timing.timed.some(t => t.attack.heads.length >= 2 && t.attack.beats >= 2)
    || timing.timed.some(t => t.attack.hiddenHead)) return timing;
  if (voices.length === 2 && timing.timed.every(t => t.attack.stem)) {
    const byStem = [true, false].map(up => timing.timed.filter(t => t.attack.stem!.up === up).sort((a, b) => a.beat - b.beat));
    const complete = byStem.every(line => line.length && within(line[0]!.beat, 0, 1e-8)
      && line.every((t, i) => within(t.beat + t.attack.beats, line[i + 1]?.beat ?? timing.length, 1e-8)));
    if (complete) return { ...timing, timed: timing.timed.map(t => ({ ...t, voice: Number(!t.attack.stem!.up) })) };
  }
  const lines = voices.map(voice => timing.timed.filter(t => t.voice === voice && !t.attack.rest));
  const up = lines.findIndex(line => line.length > 0 && line.every(t => t.attack.stem?.up));
  const down = lines.findIndex(line => line.length > 0 && line.every(t => t.attack.stem?.up === false));
  const stemless = lines.findIndex(line => line.length > 0 && line.every(t => !t.attack.stem));
  const primary = up >= 0 ? up : stemless;
  if (down < 0 || primary < 0 || primary === down || voices.length > 3
    || voices.length === 3 && (up < 0 || stemless < 0)) return timing;
  const order = [voices[primary], voices[down], ...voices.filter((_, i) => i !== primary && i !== down)];
  return { ...timing, timed: timing.timed.map(t => ({ ...t, voice: order.indexOf(t.voice) })) };
}
