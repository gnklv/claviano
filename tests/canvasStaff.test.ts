// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasStaff } from '../src/infrastructure/render/CanvasStaff';
import { paintShape } from '../src/infrastructure/render/staff/paint';
import { group, type Shape } from '../src/infrastructure/render/staff/shapes';
import { TapeTiles, type TapePiece } from '../src/infrastructure/render/staff/tapeTiles';
import { secondsAtBeat } from '../src/domain/score';
import { ode, sounding } from './staffPieces';

/* The staff on a canvas: its shapes drawn as SVG would draw them, its tape in pictures drawn ahead, and the music lit as it sounds. */

/** A canvas context that draws nothing and writes down what it was asked: each call, with the paint set at the time. */
function recorder() {
  const calls: { name: string; args: unknown[]; fill: unknown; stroke: unknown; alpha: unknown }[] = [];
  const state: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args: unknown[]) => void calls.push({ name: String(name), args, fill: target.fillStyle, stroke: target.strokeStyle, alpha: target.globalAlpha });
    },
    set: (target, name, value) => ((target[name] = value), true),
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const colours = (paint: string) => paint.replace(/^var\(--(.+)\)$/, '#$1');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the shapes on a canvas', () => {
  it('paints what is in a group in the group’s colour, and a colour given over it', () => {
    const { ctx, calls } = recorder();
    const chord = group([{ kind: 'line', x1: 0, y1: 0, x2: 0, y2: 10, stroke: 'currentColor', width: 1 }, { kind: 'text', x: 0, y: 5, text: 'x', size: 10, font: 'Bravura', fill: 'currentColor' }], 'var(--ink)');
    paintShape(ctx, chord, colours, '#other');
    expect(calls.filter((call) => call.name === 'stroke').map((call) => call.stroke)).toEqual(['#ink']);
    expect(calls.filter((call) => call.name === 'fillText').map((call) => call.fill)).toEqual(['#ink']);
  });

  it('draws a hint pale, and leaves out what is painted with nothing', () => {
    // (The test page has no Path2D: a path is only handed on to the context here.)
    vi.stubGlobal('Path2D', class {});
    const { ctx, calls } = recorder();
    const pale: Shape = { kind: 'text', x: 0, y: 0, text: '2', size: 10, font: 'Bravura', fill: 'currentColor', opacity: 0.45 };
    paintShape(ctx, pale, colours, '#ink');
    paintShape(ctx, { kind: 'path', d: 'M0 0L1 1', fill: 'none', stroke: 'currentColor', width: 1 }, colours, '#ink');
    expect(calls.find((call) => call.name === 'fillText')?.alpha).toBe(0.45);
    expect(calls.some((call) => call.name === 'fill')).toBe(false);
    expect(calls.some((call) => call.name === 'stroke')).toBe(true);
  });
});

describe('the tape in pictures', () => {
  /** Tiles over pieces one at every 100 pixels of tape, counting the pictures drawn. */
  function tiles() {
    const pieces: TapePiece[] = Array.from({ length: 100 }, (_, i) => ({ shape: { kind: 'line', x1: i * 100, y1: 0, x2: i * 100, y2: 10, stroke: 'currentColor', width: 1 }, extent: [i * 100, i * 100], color: 'var(--ink)' }));
    const painted: number[] = [];
    let made = 0;
    const tape = new TapeTiles(
      (_, piece) => void painted.push(piece.extent![0]),
      () => {
        made++;
        return { width: 0, height: 0, getContext: () => recorder().ctx } as unknown as HTMLCanvasElement;
      },
    );
    tape.set(pieces, 300, 1);
    return { tape, painted, made: () => made };
  }

  it('draws the pictures in sight at once, and the next one ahead with them', () => {
    const { tape, painted } = tiles();
    const { ctx, calls } = recorder();
    tape.lay(ctx, 0, 600);
    // In sight: 0–600, the pictures 0–512 and 512–1024, laid; and 1024–1536, ahead, drawn.
    expect(calls.filter((call) => call.name === 'drawImage')).toHaveLength(2);
    expect(Math.max(...painted)).toBeGreaterThanOrEqual(1024);
    expect(Math.max(...painted)).toBeLessThan(1536 + 100);
    // Laid again where it was, nothing is drawn; a picture further on, the one after it is.
    const drawn = painted.length;
    tape.lay(ctx, 0, 600);
    expect(painted.length).toBe(drawn);
    tape.lay(ctx, 512, 600);
    expect(Math.max(...painted)).toBeGreaterThanOrEqual(1536);
  });

  it('draws a picture once, however many frames lay it', () => {
    const { tape, painted } = tiles();
    const { ctx } = recorder();
    for (let frame = 0; frame < 10; frame++) tape.lay(ctx, 0, 600);
    expect(new Set(painted).size).toBe(painted.length);
  });

  it('lets go of the pictures left far behind, and draws on their canvases again', () => {
    const { tape, made } = tiles();
    const { ctx } = recorder();
    for (let left = 0; left < 9000; left += 100) tape.lay(ctx, left, 600);
    // A dozen canvases at most for ninety frames over nine thousand pixels: the far ones were let go of and taken again.
    expect(made()).toBeLessThan(12);
  });
});

describe('CanvasStaff', () => {
  it('lights the chords sounding under the cursor, in their hand’s colour', () => {
    const contexts: ReturnType<typeof recorder>[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const made = recorder();
      contexts.push(made);
      return made.ctx;
    });
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: (name: string) => `#${name.slice(2)}` }) as CSSStyleDeclaration);
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { get: () => 1024 }, clientHeight: { get: () => 300 } });
    const staff = new CanvasStaff(container);
    const score = ode();
    staff.setScore(score);
    staff.render(secondsAtBeat(score, 0) + 1e-3);
    const fills = contexts.flatMap(({ calls }) => calls.filter((call) => call.name === 'fillText').map((call) => call.fill));
    const hands = sounding(score, 0);
    expect(hands.length).toBeGreaterThan(0);
    for (const hand of new Set(hands)) expect(fills).toContain(`#${hand}`);
    staff.dispose();
  });
});
