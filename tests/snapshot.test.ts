// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { odeToJoy } from '../src/demo/odeToJoy';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { engravePedal as layoutPedal } from '../src/domain/notation/pedalEngraving';
import { drawing, drawStaff } from './drawnStaff';

/*
 * Reference copies of what the showcase comes out as: its score (the notes as played and as
 * written), its engraving (what stands where on the staves) and its drawing (what the staff
 * draws). Any change in reading, playing, engraving or drawing shows up here line by line, meant
 * or not.
 *
 * A change that is meant is accepted with `npm run test:accept`, which rewrites the files in
 * tests/snapshots; the commit then shows exactly what changed.
 */

/** Numbers without the noise of arithmetic, and nothing that only says "no": null, false, an empty list. */
function tidy(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : String(value);
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === 'object') {
    const kept = Object.entries(value)
      .map(([key, item]) => [key, tidy(item)] as const)
      .filter(([, item]) => item !== null && item !== false && item !== undefined && !(Array.isArray(item) && item.length === 0));
    return Object.fromEntries(kept);
  }
  return value;
}

/**
 * One line for each item of each list, so a change touches only the lines it is about. An object
 * of lists (the score's notation) is opened up the same way, its lists named "notation.notes"….
 */
function readable(value: object, prefix = ''): string {
  return Object.entries(value)
    .map(([key, item]) => {
      const name = prefix + key;
      if (Array.isArray(item)) {
        const tidied = tidy(item) as unknown[];
        return `${name}: ${tidied.length}\n${tidied.map((element) => `  ${JSON.stringify(element)}\n`).join('')}`;
      }
      const lists = item !== null && typeof item === 'object' && Object.values(item as object).some(Array.isArray);
      return lists ? readable(item as object, `${name}.`) : `${name}: ${JSON.stringify(tidy(item))}\n`;
    })
    .join('');
}

const load = (file: string): ArrayBuffer => {
  const bytes = readFileSync(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('reference copies', () => {
  const showcase = new MusicXmlParser().parse(load('public/demos/showcase.musicxml'), 'showcase');

  it('the showcase as a score: read from MusicXML and played', async () => {
    await expect(readable(showcase)).toMatchFileSnapshot('./snapshots/showcase.score.txt');
  });

  it('the showcase engraved: what stands where on the staves', async () => {
    await expect(readable({ ...layoutNotation(showcase), pedal: layoutPedal(showcase) })).toMatchFileSnapshot('./snapshots/showcase.engraving.txt');
  });

  it('the Ode to Joy engraved: played notes written down by the domain', async () => {
    const ode = odeToJoy('Ode to Joy');
    await expect(readable(layoutNotation(ode))).toMatchFileSnapshot('./snapshots/ode.engraving.txt');
  });

  // What the staff draws for it all, element by element (at 1024 by 300 pixels).
  it('the showcase drawn on the staff', async () => {
    await expect(drawing(drawStaff(showcase).container)).toMatchFileSnapshot('./snapshots/showcase.staff.txt');
  });

  it('the Ode to Joy drawn on the staff', async () => {
    await expect(drawing(drawStaff(odeToJoy('Ode to Joy')).container)).toMatchFileSnapshot('./snapshots/ode.staff.txt');
  });
});
