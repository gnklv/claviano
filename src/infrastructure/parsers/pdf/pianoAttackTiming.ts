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

/** Concurrent voices start together. The next printed column belongs to the
 * voice whose preceding value finishes first. A shared head carries both attacks. */
export function timeAttacks(attacks: PianoAttack[], space: number, length: number, shortBar: boolean): AttackTiming | null {
  const clocks: number[] = [0];
  const timed: TimedAttack[] = [];
  for (let i = 0; i < attacks.length;) {
    const first = attacks[i]!;
    let end = i + 1;
    const sameColumn = (attack: PianoAttack) => within(first.x, attack.x, space * 0.17)
      || !first.rest && !!attack.rest && within(attack.x - first.x, space * 0.5, space * 0.04);
    while (end < attacks.length && sameColumn(attacks[end]!)) end++;
    const column = attacks.slice(i, end).sort((a, b) => a.beats - b.beats);
    if (column.length > 1 && !column.some(attack => attack.hiddenHead)) {
      column.sort((a, b) => {
        if (!!a.rest !== !!b.rest && within(Math.abs(a.x - b.x), space * 0.5, space * 0.04)) return a.x - b.x;
        if (a.rest && b.rest) return b.rest.y - a.rest.y;
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
    if (line.length && within(line[0]!.x, held.x, space * 1.65)
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
