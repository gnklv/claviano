// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { RollColors, RollFrame } from '../src/application/ports/RollView';
import { odeToJoy } from '../src/demo/odeToJoy';
import { CanvasPianoRoll } from '../src/infrastructure/render/CanvasPianoRoll';

/* The falling notes on a canvas: what is drawn, and when nothing need be. */

/** A canvas whose drawing is counted, not shown (the test DOM draws nothing). */
function countedCanvas() {
  let drawn = 0;
  /** What the drawing sets on the context (its fill style, its font). */
  const settings: Record<string | symbol, unknown> = {};
  const context = new Proxy(settings, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (name === 'measureText') return () => ({ width: 10 });
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => void (name === 'fillRect' && drawn++);
    },
    set: (target, name, value) => ((target[name] = value), true),
  });
  const canvas = { clientWidth: 800, clientHeight: 400, width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, drawn: () => drawn };
}

const score = odeToJoy('Ode to Joy');
const DARKER: RollColors = {
  background: '#000',
  barLine: '#111',
  barNumber: '#222',
  loop: '#333',
  loopEdge: '#444',
  nowLine: '#555',
  whiteKey: '#eee',
  blackKey: '#111',
  keyBorder: '#999',
  keyLabel: '#888',
  pedal: '#777',
  cursor: '#f00',
  hand: { right: '#00f', left: '#0f0' },
};
const frame = (position: number, more: Partial<RollFrame> = {}): RollFrame => ({
  score,
  position,
  playing: false,
  loop: null,
  isHandEnabled: () => true,
  pedalEnabled: true,
  noteLabel: (midi) => String(midi),
  pedalLabel: () => 'Pedal',
  ...more,
});

describe('the falling notes', () => {
  it('draw a frame, and do not draw it again while it would show the same', () => {
    const { canvas, drawn } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas);
    roll.render(frame(1));
    const once = drawn();
    expect(once).toBeGreaterThan(0);
    roll.render(frame(1));
    roll.render(frame(1, { pedalLabel: () => 'Pedal' }));
    expect(drawn()).toBe(once);
  });

  it('draw anew when the music moves, a hand is muted, or the canvas changes size or colours', () => {
    const { canvas, drawn } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas);
    roll.render(frame(1));
    const steps = [
      () => roll.render(frame(1.5)),
      () => roll.render(frame(1.5, { isHandEnabled: (hand) => hand === 'right' })),
      () => (roll.resize(), roll.render(frame(1.5, { isHandEnabled: (hand) => hand === 'right' }))),
      () => (roll.setColors(DARKER), roll.render(frame(1.5, { isHandEnabled: (hand) => hand === 'right' }))),
    ];
    for (const step of steps) {
      const before = drawn();
      step();
      expect(drawn()).toBeGreaterThan(before);
    }
  });
});
