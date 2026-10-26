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
  let settings: Record<string | symbol, unknown> = {};
  /** The settings put by with `save`, and the line width each rectangle was outlined with. */
  const saved: Record<string | symbol, unknown>[] = [];
  const outlines: unknown[] = [];
  /** The words written, each with the ink it was written in. */
  const written: { text: string; ink: unknown }[] = [];
  const context = new Proxy(settings, {
    get: (_, name) => {
      if (name in settings) return settings[name];
      if (name === 'measureText') return () => ({ width: 10 });
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (name === 'save') return () => void saved.push({ ...settings });
      if (name === 'restore') return () => void (settings = saved.pop() ?? settings);
      if (name === 'strokeRect') return () => void outlines.push(settings.lineWidth);
      if (name === 'fillText') return (text: string) => void written.push({ text, ink: settings.fillStyle });
      return () => void (name === 'fillRect' && drawn++);
    },
    set: (_, name, value) => ((settings[name] = value), true),
  });
  const canvas = { clientWidth: 800, clientHeight: 400, width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLCanvasElement;
  return { canvas, drawn: () => drawn, outlines, written };
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
  onHand: '#fff',
  pedal: '#777',
  cursor: '#f00',
  hand: { right: '#00f', left: '#0f0' },
};
/** The colours it is made with: a light theme's, as far as these tests care. */
const PAPER: RollColors = { ...DARKER, background: '#fff', whiteKey: '#fff' };
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
    const roll = new CanvasPianoRoll(canvas, PAPER);
    roll.render(frame(1));
    const once = drawn();
    expect(once).toBeGreaterThan(0);
    roll.render(frame(1));
    roll.render(frame(1, { pedalLabel: () => 'Pedal' }));
    expect(drawn()).toBe(once);
  });

  it('draw anew when the music moves, a hand is muted, or the canvas changes size or colours', () => {
    const { canvas, drawn } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas, PAPER);
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

  it('tell the note under a press: the tiles sounding at that height, and none over the keyboard', () => {
    const { canvas } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas, PAPER);
    roll.render(frame(0));
    let rollHeight = 0;
    while (roll.timeAt(rollHeight + 1) !== null) rollHeight++;
    // A tenth of a second into the music: what sounds then is under the press, across the keys.
    const y = rollHeight - 0.1 / roll.secondsPerPixel!;
    const found = new Set<number | null>();
    for (let x = 0; x < 800; x++) found.add(roll.noteAt(x, y));
    found.delete(null);
    const sounding = score.notes.flatMap((note, index) => (note.start <= 0.1 && note.start + note.duration >= 0.1 ? [index] : []));
    expect([...found].sort((a, b) => a! - b!)).toEqual(sounding);
    expect(roll.noteAt(400, rollHeight + 10)).toBeNull();
  });

  it('ring the note being fingered without thickening the keys drawn after it', () => {
    const { canvas, outlines } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas, PAPER);
    roll.render(frame(0));
    const plain = [...outlines];
    outlines.length = 0;
    roll.render(frame(0, { picked: [0] }));
    expect(plain.length).toBeGreaterThan(0);
    expect(outlines).toEqual(plain);
  });

  it('name a Do pressed in the ink that reads on its hand, and the others in the keys\' own', () => {
    const { canvas, written } = countedCanvas();
    const roll = new CanvasPianoRoll(canvas, PAPER);
    // A moment a Do is played (the labels are the keys' numbers here).
    const played = score.notes.find((note) => note.pitch % 12 === 0)!;
    roll.render(frame(played.start));
    const dos = written.filter(({ text }) => Number(text) % 12 === 0);
    expect(dos.find(({ text }) => Number(text) === played.pitch)?.ink).toBe(PAPER.onHand);
    expect(dos.filter(({ ink }) => ink === PAPER.keyLabel).length).toBeGreaterThan(0);
  });
});
