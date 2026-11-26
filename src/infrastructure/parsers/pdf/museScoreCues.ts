import type { PdfGeometry, PdfGlyph } from './geometry';
import type { AttackTiming, TimedAttack } from './pianoAttackTiming';
import { readPianoAttacks, type PianoAttack } from './pianoAttacks';
import { codePoint, isHead, strips, within, type Staff } from './pianoGeometry';

/** A rest printed at cue size identifies a measured voice alongside the
 * main staff. Its glyphs shrink, while their pitches stay on the staff grid. */
export function measuredCueGlyphs(row: PdfGlyph[], space: number): PdfGlyph[] {
  const reduced = row.filter(g => within(g.size, space * 2.8, space * 0.08));
  return reduced.some(isHead) && reduced.some(g => codePoint(g) >= 0xe4e3 && codePoint(g) <= 0xe4e8)
    ? reduced : [];
}

export function readCueTiming(
  geometry: PdfGeometry, glyphs: PdfGlyph[], staff: Staff, regular: PianoAttack[], length: number,
): AttackTiming | null {
  const size = staff.space * 0.7;
  const cues = readPianoAttacks(geometry, glyphs, staff, strips(geometry.fills, size, 1), length, size);
  if (!cues?.length || !regular.length) return null;
  const total = (line: PianoAttack[]) => line.reduce((sum, attack) => sum + attack.beats, 0);
  const main = [...regular];
  // The cue can switch to normal size on its final attack.
  const last = main.at(-1)!;
  if (last.x > cues.at(-1)!.x && cues.at(-1)!.rest && within(total(main) - last.beats, length, 1e-8)) {
    cues.push(main.pop()!);
  }
  if (!within(total(main), length, 1e-8)) return null;
  const sequence = (line: PianoAttack[], voice: number, start: number): TimedAttack[] => {
    let beat = start;
    return line.map(attack => {
      const item = { attack, beat, voice };
      beat += attack.beats;
      return item;
    });
  };
  const timed = sequence(main, 0, 0);
  if (total(cues) <= length + 1e-8) {
    const start = length - total(cues);
    if (start > 1e-8 && (!cues[0]!.rest || cues[0]!.x <= main.at(-1)!.x || start <= timed.at(-1)!.beat)) return null;
    timed.push(...sequence(cues, 1, start));
  } else {
    // Opposing cue stems identify two simultaneous voices. Printed rests
    // belong to the only line they can complete.
    const lines = [false, true].map(up => cues.filter(a => a.stem?.up === up));
    const rests = cues.filter(a => a.rest);
    const complete = lines.findIndex(line => within(total(line), length, 1e-8));
    if (complete < 0 || lines.flat().length + rests.length !== cues.length) return null;
    lines[1 - complete]!.push(...rests);
    if (!within(total(lines[1 - complete]!), length, 1e-8)) return null;
    lines.forEach((line, i) => timed.push(...sequence(line.sort((a, b) => a.x - b.x), i + 1, 0)));
  }
  return { timed: timed.sort((a, b) => a.beat - b.beat || a.voice - b.voice), length };
}
