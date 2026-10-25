// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { partsOf } from '../src/domain/practice/parts';
import { AT_TEMPO, planOf, SLOW } from '../src/domain/practice/plan';
import { writtenBarNumber } from '../src/domain/score';
import { ode, showcase } from './staffPieces';

/* A piece in parts, and the steps for learning it. */

const bars = (score: ReturnType<typeof ode>) => partsOf(score).map((part) => `${writtenBarNumber(score, part.from)}–${writtenBarNumber(score, part.to)}`);

describe('a piece in parts', () => {
  it('cuts a piece of eight bars into two phrases of four', () => {
    expect(bars(ode())).toEqual(['1–4', '5–8']);
  });

  it('cuts by the form first, a pickup with the first part, a bar or two of a section with the one before', () => {
    expect(bars(showcase())).toEqual(['0–4', '5–9', '10–12', '13–16', '17–20', '21–24', '25–28', '29–32']);
  });
});

describe('the steps for learning it', () => {
  it('sets each hand alone and slow, both slow, up to tempo, then joins the part to the one before', () => {
    const steps = planOf(ode()).map((step) => `${step.kind} ${step.from}–${step.to} ${step.hands} ${step.tempo}${step.aim ? `→${step.aim}` : ''}`);
    expect(steps).toEqual([
      `alone 0–3 right ${SLOW}`,
      `alone 0–3 left ${SLOW}`,
      `together 0–3 both ${SLOW}`,
      `up 0–3 both ${SLOW}→${AT_TEMPO}`,
      `alone 4–7 right ${SLOW}`,
      `alone 4–7 left ${SLOW}`,
      `together 4–7 both ${SLOW}`,
      `up 4–7 both ${SLOW}→${AT_TEMPO}`,
      // (Two parts joined are the whole piece: no step of the whole after it.)
      `join 0–7 both ${AT_TEMPO}`,
    ]);
  });

  it('ends with the whole piece where the last join is not it', () => {
    const steps = planOf(showcase());
    expect(steps.at(-1)).toMatchObject({ kind: 'whole', from: 0, to: 32, tempo: AT_TEMPO });
  });
});
