import type { PianoAttack } from './pianoAttacks';
import { timeAttacks, type AttackTiming, type TimedAttack } from './pianoAttackTiming';
import { within } from './pianoGeometry';

/** LilyPond can displace opposing heads by a full head width. In two complete
 * stemmed voices, count the written values along each voice independently.
 * A displaced rest belongs to whichever line preserves the printed order. */
function timeLilyPondStaff(attacks: PianoAttack[], space: number, length: number, opening: boolean) {
  const ordinary = timeAttacks(attacks, space, length, opening);
  const rests = attacks.filter(a => a.rest);
  if (attacks.some(a => !a.rest && !a.stem) || rests.length > 10
    || !attacks.some(a => a.stem?.up) || !attacks.some(a => a.stem && !a.stem.up)
    || !within(attacks.reduce((sum, a) => sum + a.beats, 0), length * 2, 1e-6)) return ordinary;
  let best = null, cost = Infinity;
  for (let mask = 0; mask < 2 ** rests.length; mask++) {
    const clocks = [0, 0];
    let ri = 0;
    const timed = attacks.map(attack => {
      const voice = attack.rest ? (mask >> ri++) & 1 : Number(!attack.stem!.up);
      const beat = clocks[voice]!;
      clocks[voice] = beat + attack.beats;
      return { attack, voice, beat };
    });
    if (clocks.some(clock => !within(clock, length, 1e-6))) continue;
    let penalty = 0;
    for (const [i, current] of timed.entries()) {
      for (const previous of timed.slice(0, i)) {
        const dx = (current.attack.x - previous.attack.x) / space;
        const dt = current.beat - previous.beat;
        if (dt < -1e-6) penalty += (1 + dx) * -dt;
        if (Math.abs(dt) < 1e-6) penalty += Math.max(0, dx - 1.4);
        if (dx < 0.1) penalty += Math.abs(dt);
      }
    }
    if (penalty < cost) { best = { timed, length }; cost = penalty; }
  }
  return best ?? ordinary;
}

const sameBeat = (a: number, b: number) => Math.abs(a - b) < 1e-7;

interface Column {
  x: number;
  attacks: { attack: PianoAttack; staff: number }[];
  beat?: number;
}

function columnsFor(rows: PianoAttack[][], space: number): Column[] {
  const entries = rows.flatMap((attacks, staff) => attacks.map(attack => ({ attack, staff })))
    .sort((a, b) => a.attack.x - b.attack.x);
  const columns: Column[] = [];
  for (const entry of entries) {
    const x = entry.attack.x;
    const last = columns.at(-1);
    const displacement = last ? (x - last.x) / space : Infinity;
    const shifted = entry.attack.stem?.up === false && Math.abs(displacement - 1.316) < 0.08
      && last?.attacks.some(other => other.staff === entry.staff && other.attack.stem?.up);
    const shiftedRest = entry.attack.rest && Math.abs(displacement - 0.8) < 0.08
      && last?.attacks.some(other => other.staff === entry.staff);
    if (last && (displacement < 0.22 || shifted || shiftedRest)) last.attacks.push(entry);
    else columns.push({ x, attacks: [entry] });
  }
  return columns;
}

function addAttack(voices: number[], timed: TimedAttack[], attack: PianoAttack, beat: number, used: Set<number>) {
  let voice = voices.findIndex((end, i) => !used.has(i) && sameBeat(beat, end));
  if (voice < 0) voice = voices.findIndex((end, i) => !used.has(i) && end < beat);
  if (voice < 0) voice = voices.length;
  used.add(voice);
  voices[voice] = beat + attack.beats;
  timed.push({ attack, beat, voice });
}

/** A displaced beam head can be at the x-coordinate of a later attack in
 * the other staff. The beam requires consecutive values in this case. */
function resolveBeamOverlaps(timings: AttackTiming[], space: number): AttackTiming[] {
  return timings.map((timing, staff) => {
    const anchors = timings.filter((_, i) => i !== staff).flatMap(t => t.timed);
    const timed = timing.timed.map((event, i) => {
      if (event.attack.beams[0] !== 'begin' || !event.attack.stem) return event;
      const continuation = timing.timed.slice(i + 1).find(next =>
        next.attack.stem?.up === event.attack.stem?.up && next.attack.beams[0] !== undefined);
      if (!continuation || continuation.attack.beams[0] === 'begin') return event;
      const beat = continuation.beat - event.attack.beats;
      if (beat < 0 || beat >= event.beat - 1e-7 || !anchors.some(anchor =>
        sameBeat(beat, anchor.beat) && Math.abs(event.attack.x - anchor.attack.x) < space * 2.25)) return event;
      return { ...event, beat };
    });
    return { ...timing, timed: timed.sort((a, b) => a.beat - b.beat || a.attack.x - b.attack.x) };
  });
}

/** A voice may have omitted rests. Its attacks still share the same printed
 * columns with the other staff, even when that voice starts late or ends early. */
export function timeLilyPondStaves(attacks: (PianoAttack[] | null)[], space: number,
  nominal: number, shortBar: boolean): AttackTiming[] | null {
  if (attacks.some(row => !row?.length)) return null;
  const rows = attacks as PianoAttack[][];
  const direct = rows.map(row => timeLilyPondStaff(row, space, nominal, shortBar));
  const firstLength = direct[0]?.length;
  if (firstLength !== undefined && direct.every(n => n && sameBeat(n.length, firstLength))) {
    return resolveBeamOverlaps(direct as AttackTiming[], space);
  }
  if (rows.length < 2) return null;

  const columns = columnsFor(rows, space);
  const beats = new Map<PianoAttack, number>();
  direct.forEach(timing => {
    if (timing && sameBeat(timing.length, nominal)) {
      for (const event of timing.timed) beats.set(event.attack, event.beat);
    }
  });
  let previousAnchor = -1;
  for (const column of columns) {
    const anchors = column.attacks.flatMap(({ attack }) => beats.has(attack) ? [beats.get(attack)!] : []);
    if (anchors.length && anchors.every(beat => sameBeat(beat, anchors[0]!)) && anchors[0]! > previousAnchor) {
      column.beat = anchors[0]!;
      previousAnchor = column.beat;
    } else if (anchors.length) return null;
  }

  const voices = rows.map(() => [0]);
  const result: AttackTiming[] = rows.map(() => ({ length: nominal, timed: [] }));
  let previous = -1;
  for (const [index, column] of columns.entries()) {
    const ends = voices.flat().filter(end => end > previous + 1e-7);
    const nextAnchor = columns.slice(index + 1).find(c => c.beat !== undefined)?.beat ?? nominal;
    const beat = column.beat ?? (index ? Math.min(...ends) : 0);
    if (beat <= previous || beat >= nextAnchor || column.attacks.some(({ attack }) => beat + attack.beats > nominal + 1e-7)) return null;
    for (const [staff, clocks] of voices.entries()) {
      const layer = column.attacks.filter(event => event.staff === staff)
        .sort((a, b) => Number(b.attack.stem?.up ?? false) - Number(a.attack.stem?.up ?? false));
      const used = new Set<number>();
      for (const event of layer) addAttack(clocks, result[staff]!.timed, event.attack, beat, used);
    }
    previous = beat;
  }
  if (!voices.flat().some(end => sameBeat(end, nominal))) return null;
  return resolveBeamOverlaps(result, space);
}
