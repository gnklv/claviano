import type { PianoAttack } from './pianoAttacks';
import { within } from './pianoGeometry';

export interface TimedAttack {
  attack: PianoAttack;
  beat: number;
  voice: number;
}

export interface AttackTiming {
  timed: TimedAttack[];
  length: number;
}

/** Match the full primary rhythm to the opposite staff. A simultaneous
 * printed rest can introduce a secondary phrase under one primary note. */
function timeRestPhrases(attacks: PianoAttack[], space: number, reference: AttackTiming): AttackTiming | null {
  if (!attacks.some(a => a.rest) || reference.timed.some(item => item.voice !== 0)) return null;
  const timed: TimedAttack[] = [];
  for (const [i, anchor] of reference.timed.entries()) {
    const left = anchor.attack.x - space * 0.17;
    const next = reference.timed[i + 1];
    const right = next ? next.attack.x - space * 0.17 : Infinity;
    const group = attacks.filter(a => a.x >= left && a.x < right);
    const simultaneous = group.filter(a => within(a.x, anchor.attack.x, space * 0.17));
    const primary = simultaneous.filter(a => !a.rest && within(a.beats, anchor.attack.beats, 1e-8));
    if (primary.length !== 1) return null;
    timed.push({ attack: primary[0]!, beat: anchor.beat, voice: 0 });
    const phrase = group.filter(a => a !== primary[0]);
    if (!phrase.length) continue;
    if (!phrase[0]!.rest || !simultaneous.includes(phrase[0]!) || phrase.length < 2
      || phrase.slice(1).some(a => a.stem?.up !== false || simultaneous.includes(a))) return null;
    let beat = anchor.beat;
    for (const attack of phrase) {
      timed.push({ attack, beat, voice: 1 });
      beat += attack.beats;
    }
    if (!within(beat, anchor.beat + anchor.attack.beats, 1e-8)) return null;
  }
  return timed.length === attacks.length ? { timed, length: reference.length } : null;
}

function timeLayeredVoices(
  attacks: PianoAttack[], space: number, length: number, reference: AttackTiming,
): AttackTiming | null {
  const aligned = (attack: PianoAttack) => reference.timed.filter(item => within(item.attack.x, attack.x, space * 0.17));
  // A secondary voice may end before the barline without a printed closing
  // rest. Check shared columns against the opposite staff and require distinct
  // stem directions. An explicit rest opposite a stem takes the other voice.
  if (attacks.some(a => a.stem?.up) && attacks.some(a => a.stem?.up === false)) {
    const anchored: TimedAttack[] = [];
    const ends = [0, 0];
    for (const attack of attacks) {
      const anchors = aligned(attack);
      const opposite = attacks.find(a => a.stem && within(a.x, attack.x, space * 0.17));
      const voice = attack.stem ? Number(!attack.stem.up) : attack.rest && opposite ? Number(opposite.stem!.up) : undefined;
      if (voice === undefined) break;
      const beat = ends[voice]!;
      const previous = anchored.at(-1);
      if (anchors.some(a => !within(a.beat, beat, 1e-8)) || beat + attack.beats > length + 1e-8
        || !beat && !anchors.length || previous && (beat < previous.beat - 1e-8
          || within(previous.attack.x, attack.x, space * 0.17) && !within(beat, previous.beat, 1e-8))) break;
      anchored.push({ attack, beat, voice });
      ends[voice] = beat + attack.beats;
    }
    if (anchored.length === attacks.length && ends.some(end => within(end, length, 1e-8))) {
      return { timed: anchored.sort((a, b) => a.beat - b.beat || a.voice - b.voice), length };
    }
  }
  // Opposing stems on a unison can displace the sustained head by a
  // head width. Both primary voices must fill the measure independently.
  for (const held of attacks.filter(a => a.stem?.up === false && a.heads.length === 1 && a.beats > 1)) {
    const main = timeAttacks(attacks.filter(a => a !== held), space, length, false);
    if (!main || !main.timed.some(a => a.voice === 1)
      || main.timed.some(item => aligned(item.attack).some(a => !within(a.beat, item.beat, 1e-8)))) continue;
    const matches = main.timed.filter(({ attack, beat }) => attack.stem?.up && attack.heads.length === 1
      && within(attack.heads[0]!.y, held.heads[0]!.y, space * 0.05)
      && within(held.x - attack.x, space * 1.6, space * 0.12) && within(beat + held.beats, length, 1e-8));
    if (matches.length === 1) {
      return { timed: [...main.timed, { attack: held, beat: matches[0]!.beat, voice: 2 }]
        .sort((a, b) => a.beat - b.beat || a.voice - b.voice), length };
    }
  }
  // A third voice can enter against a sustained note of the same stem
  // direction. MuseScore moves one of their heads sideways to avoid overlap.
  for (const held of attacks.filter(a => a.stem && a.beats > 1)) {
    const entry = attacks.find(a => a !== held && a.stem?.up === held.stem!.up
      && within(Math.abs(a.x - held.x), space * 0.5, space * 0.05));
    if (!entry) continue;
    const anchor = aligned(entry)[0];
    if (!anchor) continue;
    const end = anchor.beat + held.beats;
    const phrase: TimedAttack[] = [];
    let beat = anchor.beat;
    while (beat < end - 1e-8) {
      const matches = attacks.filter(a => a !== held && a.stem?.up === held.stem!.up
        && aligned(a).some(item => within(item.beat, beat, 1e-8)));
      if (matches.length !== 1) break;
      const attack = matches[0]!;
      phrase.push({ attack, beat, voice: 2 });
      beat += attack.beats;
    }
    if (!within(beat, end, 1e-8)) continue;
    const primary = timeAttacks(attacks.filter(a => !phrase.some(item => item.attack === a)), space, length, false);
    if (primary?.timed.some(item => item.attack === held && within(item.beat, anchor.beat, 1e-8))
      && primary.timed.every(item => aligned(item.attack).every(a => within(a.beat, item.beat, 1e-8)))) {
      return { timed: [...primary.timed, ...phrase].sort((a, b) => a.beat - b.beat || a.voice - b.voice), length };
    }
  }
  return null;
}

/** MuseScore can omit the rests around secondary attacks. Read the
 * complete primary line independently, using the other staff to check its clock. */
export function timeSparseVoice(
  attacks: PianoAttack[], space: number, length: number, reference: AttackTiming,
): AttackTiming | null {
  if (reference.length !== length) return null;
  const aligned = (attack: PianoAttack) => reference.timed.filter(item => within(item.attack.x, attack.x, space * 0.17));
  const phrases = timeRestPhrases(attacks, space, reference);
  if (phrases) return phrases;
  const candidates: TimedAttack[][] = [];
  const secondaryAttacks = attacks.filter(attack => attack.stem?.up === false
    && !attack.beams.length && !attack.tupletPart && !attack.tremolo);
  const partitions = secondaryAttacks.map(attack => [attack]);
  if (secondaryAttacks.length > 1) partitions.push(secondaryAttacks);
  for (const secondary of partitions) {
    const main = attacks.filter(attack => !secondary.includes(attack));
    const timing = timeAttacks(main, space, length, false);
    if (!timing || timing.timed.some(item => item.voice !== 0
      || aligned(item.attack).some(anchor => !within(anchor.beat, item.beat, 1e-8)))) continue;
    const recovered: TimedAttack[] = [];
    for (const attack of secondary) {
      const possible = timing.timed.filter(({ attack: anchor, beat }) => {
        if (!anchor.stem?.up || beat + attack.beats > length + 1e-8
          || !aligned(anchor).some(item => within(item.beat, beat, 1e-8))
          || aligned(attack).some(item => !within(item.beat, beat, 1e-8))) return false;
        if (within(attack.x, anchor.x, space * 0.17)) return true;
        // A down-stem unison can be moved to the right of the primary note's dot.
        return anchor.duration.dots === 1 && within(attack.x - anchor.x, space * 2.35, space * 0.15)
          && attack.heads.length === 1 && anchor.heads.length === 1
          && within(attack.heads[0]!.y, anchor.heads[0]!.y, space * 0.05)
          && within(beat + attack.beats, length, 1e-8);
      });
      const previous = recovered.at(-1);
      if (possible.length !== 1 || previous && previous.beat + previous.attack.beats > possible[0]!.beat + 1e-8) break;
      recovered.push({ attack, beat: possible[0]!.beat, voice: 1 });
    }
    if (recovered.length === secondary.length) {
      candidates.push([...timing.timed, ...recovered].sort((a, b) => a.beat - b.beat || a.voice - b.voice));
    }
  }
  if (!candidates.length) return timeLayeredVoices(attacks, space, length, reference);
  return candidates.length === 1 ? { timed: candidates[0]!, length } : null;
}

/** Concurrent voices start together. The next printed column belongs to the
 * voice whose preceding value finishes first. A shared head carries both attacks. */
export function timeAttacks(attacks: PianoAttack[], space: number, length: number, shortBar: boolean): AttackTiming | null {
  const clocks: number[] = [0];
  const timed: TimedAttack[] = [];
  const sameColumn = (first: PianoAttack, attack: PianoAttack) => within(first.x, attack.x, space * 0.17)
    || !first.rest && !!attack.rest && within(attack.x - first.x, space * 0.5, space * 0.04);
  for (let i = 0; i < attacks.length;) {
    const first = attacks[i]!;
    let end = i + 1;
    while (end < attacks.length && sameColumn(first, attacks[end]!)) end++;
    const column = attacks.slice(i, end).sort((a, b) => a.beats - b.beats);
    if (column.length > 1 && !column.some(attack => attack.hiddenHead)) {
      column.sort((a, b) => {
        if (!!a.rest !== !!b.rest && within(Math.abs(a.x - b.x), space * 0.5, space * 0.04)) return a.x - b.x;
        if (a.rest && b.rest) return b.rest.y - a.rest.y;
        if (a.rest && b.stem) return b.stem.up ? 1 : -1;
        if (b.rest && a.stem) return a.stem.up ? -1 : 1;
        return Number(b.stem?.up ?? false) - Number(a.stem?.up ?? false);
      });
    }
    const beat = Math.min(...clocks);
    const available = clocks.flatMap((value, index) => within(value, beat, 1e-8) ? [index] : []);
    for (const attack of column) {
      const voice = available.shift() ?? clocks.length;
      clocks[voice] = beat + attack.beats;
      timed.push({ attack, beat, voice });
    }
    i = end;
  }
  if (clocks.every(c => within(c, length, 1e-8))) return { timed, length };
  // A held voice can displace the other voice's first head by one head width.
  // The held note and the surrounding line must each account for the entire bar.
  const held = attacks.slice(0, 2).find(attack => attack.beats === length && !attack.rest);
  if (held) {
    const line = attacks.filter(attack => attack !== held);
    const displacement = held.stem ? 1.65 : 1.9;
    if (line.length && line.every((attack, i) => !i || !sameColumn(line[i - 1]!, attack))
      && within(line[0]!.x, held.x, space * displacement)
      && within(line.reduce((sum, a) => sum + a.beats, 0), length, 1e-8)) {
      const heldVoice = held.stem ? Number(!held.stem.up) : Number(Boolean(line.find(a => a.stem)?.stem?.up));
      let beat = 0;
      const moving = line.map(attack => {
        const event = { attack, beat, voice: 1 - heldVoice };
        beat += attack.beats;
        return event;
      });
      return { timed: [{ attack: held, beat: 0, voice: heldVoice }, ...moving], length };
    }
  }
  if (attacks.every(a => a.stem)) {
    const voices = [true, false].map(up => attacks.filter(a => a.stem!.up === up));
    if (voices.every(group => within(group.reduce((sum, a) => sum + a.beats, 0), length, 1e-8))
      && within(voices[0]![0]!.x, voices[1]![0]!.x, space * 1.65)) {
      const layered = voices.flatMap((group, voice) => {
        let beat = 0;
        return group.map(attack => {
          const event = { attack, beat, voice };
          beat += attack.beats;
          return event;
        });
      }).sort((a, b) => a.attack.x - b.attack.x);
      if (layered.every((event, i) => !i || event.beat + 1e-8 >= layered[i - 1]!.beat)) {
        return { timed: layered, length };
      }
    }
  }
  // Invisible rests may be omitted from the PDF. In a regular beamed
  // subdivision, an independently stemmed sustained attack can occupy the
  // column of that rest. Accept it only if the inferred grid fills the bar.
  const step = Math.min(...attacks.map(a => a.beats));
  const regular = attacks.every(a => a.beats === step || a.beats > step && !a.beams.length);
  if (regular && attacks.length * step === length && attacks.some(a => a.beams.length)) {
    const layered = attacks.map((attack, i) => ({ attack, beat: i * step, voice: attack.beats > step ? 1 : 0 }));
    if (layered.every((t, i) => t.voice === 0 || t.beat + t.attack.beats <= (layered.slice(i + 1).find(n => n.voice === 1)?.beat ?? length))) {
      return { timed: layered, length };
    }
  }
  const firstEnd = clocks[0]!;
  if (shortBar && firstEnd > 0 && firstEnd < length && clocks.every(c => within(c, firstEnd, 1e-8))) {
    return { timed, length: firstEnd };
  }
  return null;
}
