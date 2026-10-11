// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { StaffChord, StaffMark } from '../src/domain/notation/engraving';
import { odeToJoy } from '../src/demo/odeToJoy';
import { StaffGeometry } from '../src/infrastructure/render/staff/geometry';
import { StaffInk } from '../src/infrastructure/render/staff/ink';

/* How far the notes reach up and down along the tape: what is set around them (bar numbers, words, dynamics) asks, to keep clear. */

const chord = (step: number, accidental: 'flat' | null = null): StaffChord => ({
  staff: 'treble',
  hand: 'right',
  beat: 0,
  beats: 4,
  bar: 0,
  beam: null,
  handMark: false,
  notes: [{ step, accidental }],
  duration: { value: 'whole', dots: 0 },
  stemUp: true,
  ledgerSteps: [],
});

function reach(chords: StaffChord[], marks: StaffMark[] = []) {
  const geometry = new StaffGeometry();
  geometry.resize(1024, 300);
  geometry.setScore(odeToJoy('Ode to Joy'));
  const ink = new StaffInk(geometry);
  ink.setChords(chords, marks);
  ink.reset();
  const { top, bottom } = ink.extent('treble', -1e6, 1e6);
  // In staff spaces from the note's own place, up and down.
  const y = ink.of(chords[0]).yOf(chords[0].notes[0].step);
  return { up: (y - top) / geometry.space, down: (bottom - y) / geometry.space };
}

describe('how far the notes reach', () => {
  it('is half a space each way for a head by itself', () => {
    expect(reach([chord(4)])).toEqual({ up: 0.5, down: 0.5 });
  });

  it('is more where a sign is set at the note: an accent over it is to be cleared too', () => {
    const accent: StaffMark = { chord: 0, kind: 'accent', above: true, step: 0 };
    const { up, down } = reach([chord(4)], [accent]);
    // The accent stands two spaces over the note (four steps), and is itself most of a space tall.
    expect(up).toBeCloseTo(2.9);
    expect(down).toBe(0.5);
  });

  it('is more where the note has an accidental, which stands taller than its head', () => {
    const { up, down } = reach([chord(4, 'flat')]);
    expect(up).toBeCloseTo(1.6);
    expect(down).toBeCloseTo(1.6);
  });
});
