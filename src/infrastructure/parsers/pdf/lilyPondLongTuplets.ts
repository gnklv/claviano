import type { PdfGeometry } from './geometry';
import { attachHeads, type PianoAttack } from './pianoAttacks';
import type { LilyPondMeasure } from './lilyPondMeasures';
import { center, isHead, within, type BeamStrip } from './pianoGeometry';

interface NumberedBeam {
  beam: BeamStrip;
  stems: number[];
  barCount: number;
}

/** A single beam can run through several barlines. Its italic numeral counts
 * all attached stems, even when neither end of the beam lies in the current bar. */
export function numberedLongBeams(page: PdfGeometry, beams: BeamStrip[], space: number,
  measures: readonly LilyPondMeasure[], read: (bar: LilyPondMeasure, staff: number) => PianoAttack[] | null): NumberedBeam[] {
  const groups = new Map<number, typeof page.glyphs>();
  for (const glyph of page.glyphs) {
    if (!/^\d$/.test(glyph.text) || !/ital/i.test(glyph.font) || glyph.textObject === undefined) continue;
    const digits = groups.get(glyph.textObject) ?? [];
    digits.push(glyph);
    groups.set(glyph.textObject, digits);
  }
  const result: NumberedBeam[] = [];
  for (const digits of groups.values()) {
    if (digits.length !== 2) continue;
    const [first, last] = digits;
    if (!first || !last || first.text === '0' || !within(first.y, last.y, space * .08)
      || last.x <= first.x || last.x - first.x > space * 1.4) continue;
    const count = Number(first.text + last.text);
    const x = (first.x + last.x + space * .7) / 2;
    for (const beam of beams) {
      if (!within(x, (beam.left + beam.right) / 2, space) || !within(first.y, beam.yAt(x), space * 2.5)) continue;
      const lines = page.segments.filter(s => s.x1 >= beam.left - space * .15 && s.x1 <= beam.right + space * .15
        && Math.min(Math.abs(s.y1 - beam.yAt(s.x1)), Math.abs(s.y2 - beam.yAt(s.x1))) < space * .4);
      const heads = page.glyphs.filter(g => isHead(g) && g.x >= beam.left - space * 1.5 && g.x <= beam.right + space);
      const stems = attachHeads(heads, lines, space).map(a => a.stem)
        .filter(s => within(s.far, beam.yAt(s.x), space * .4)).map(s => s.x).sort((a, b) => a - b);
      if (stems.length !== count || !within(stems[0]!, beam.left, space * .15)
        || !within(stems[count - 1]!, beam.right, space * .15)) continue;
      const systems = measures.filter(m => m.left < beam.left && m.right > beam.left)
        .flatMap(m => m.staves.map((staff, index) => ({ staff, index })))
        .sort((a, b) => Math.abs(center(a.staff) - beam.yAt(beam.left)) - Math.abs(center(b.staff) - beam.yAt(beam.left)));
      const owner = systems[0];
      if (!owner) continue;
      const bars = measures.filter(m => m.staves.includes(owner.staff) && m.left < beam.right && m.right > beam.left);
      // The meter determines the ratio only if this beam fills every bar with
      // the same number of attacks. A partial first or last bar is ambiguous.
      if (bars.length < 2 || !bars.every(bar => {
        const attacks = read(bar, owner.index);
        const segment = stems.filter(x => x > bar.left && x < bar.right);
        return segment.length * bars.length === count && attacks?.length === segment.length
          && attacks.every((a, i) => a.stem && a.stem.x === segment[i] && within(a.stem.far, beam.yAt(a.stem.x), space * .4)
            && !a.tupletPart && !a.duration.dots && (a.duration.value === 'eighth' || a.duration.value === 'quarter')
            && a.beams.length <= 1);
      })) continue;
      result.push({ beam, stems, barCount: bars.length });
    }
  }
  return result;
}

/** For a bar filled entirely by the numbered beam, the meter gives the
 * normal count. Keep the printed count across all bars for MusicXML. */
export function applyLongTuplet(attacks: PianoAttack[], groups: NumberedBeam[], space: number, length: number) {
  for (const { beam, stems, barCount } of groups) {
    if (!attacks.length || !attacks.every(a => a.stem && stems.includes(a.stem.x)
      && within(a.stem.far, beam.yAt(a.stem.x), space * .4))) continue;
    const actual = stems.length, normal = barCount * length * 2;
    if (!Number.isInteger(normal) || actual === normal) continue;
    for (const attack of attacks) {
      const x = attack.stem!.x;
      const part = x === stems[0] ? 'start' : x === stems.at(-1) ? 'stop' : 'continue';
      attack.beams = [part === 'start' ? 'begin' : part === 'stop' ? 'end' : 'continue'];
      attack.duration = { value: 'eighth', dots: 0 };
      attack.beats = .5 * normal / actual;
      attack.tupletRatio = { actual, normal };
      attack.tupletPart = part;
    }
  }
}
