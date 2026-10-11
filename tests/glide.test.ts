import { beforeEach, describe, expect, it } from 'vitest';
import { DECELERATION, Glide, HandSpeed, glideTime, glided } from '../src/ui/motion/glide';

/* A thing let go on the move goes on and slows to rest, by an iPhone's numbers. On a clock set by hand. */

describe('a thing let go', () => {
  it('loses a five-hundredth of its speed each millisecond, as a list on an iPhone does', () => {
    expect(DECELERATION).toBe(0.998);
    // Over a millisecond it goes about as far as its speed says; over a second, most of all it will.
    expect(glided(1, 1)).toBeCloseTo(0.999, 3);
    expect(glided(1, 1000)).toBeCloseTo(432, 0);
  });

  it('goes about five hundred pixels for each pixel a millisecond it was let go at, and no further', () => {
    // (All but the last ten pixels, which would take longer than anyone watches.)
    expect(Math.round(glided(1, glideTime(1)))).toBe(490);
    expect(Math.round(glided(2, glideTime(2)))).toBe(989);
    expect(glided(1, 1e6)).toBeCloseTo(499.5, 0);
  });

  it('goes back as it goes forth, and nowhere when let go at rest', () => {
    expect(glided(-1, 500)).toBeCloseTo(-glided(1, 500));
    expect(glideTime(0)).toBe(0);
    expect(glideTime(0.01)).toBe(0);
  });
});

describe('the speed of a hand', () => {
  it('is that of its last tenth of a second', () => {
    const hand = new HandSpeed();
    // Slowly for a while, then fast: the slow start is forgotten.
    for (let at = 0; at <= 400; at += 20) hand.mark(at * 0.1, at);
    for (let at = 420; at <= 520; at += 20) hand.mark(40 + (at - 400) * 2, at);
    expect(hand.letGo(520)).toBeCloseTo(2, 1);
  });

  it('is none when the hand has stopped before letting go', () => {
    const hand = new HandSpeed();
    for (let at = 0; at <= 100; at += 10) hand.mark(at * 2, at);
    expect(hand.letGo(200)).toBe(0);
  });

  it('is none for a hand that never moved', () => {
    const hand = new HandSpeed();
    hand.mark(10, 0);
    expect(hand.letGo(5)).toBe(0);
  });
});

describe('a glide', () => {
  let now: number;
  let frames: (() => void)[];
  let still: boolean;
  /** Where the thing is, and how far it can go either way. */
  let at: number;
  let ends: [number, number];
  let glide: Glide;
  /** A frame every 16 ms, until nothing asks for another (or `most` have passed). */
  const run = (most = 1000) => {
    for (let frame = 0; frames.length > 0 && frame < most; frame++) {
      now += 16;
      frames.splice(0).forEach((step) => step());
    }
  };
  /** The hand draws the thing from `from` to `to` over `time`, and (by default) lets go. */
  const draw = (from: number, to: number, time: number, letGo = true) => {
    glide.hold(from);
    for (let passed = 10; passed <= time; passed += 10) {
      now += 10;
      glide.follow(from + ((to - from) * passed) / time);
    }
    at += to - from;
    if (letGo) glide.letGo();
  };

  beforeEach(() => {
    now = 0;
    frames = [];
    still = false;
    at = 0;
    ends = [-1e6, 1e6];
    glide = new Glide(
      (by) => {
        const before = at;
        at = Math.min(ends[1], Math.max(ends[0], at + by));
        return at - before;
      },
      {
        now: () => now,
        nextFrame(step) {
          frames.push(step);
          return () => void frames.splice(frames.indexOf(step), 1);
        },
        still: () => still,
      },
    );
  });

  it('goes on the way the hand was going, as far as its speed carries it, and comes to rest', () => {
    draw(0, 100, 100);
    expect(glide.moving).toBe(true);
    run();
    expect(glide.moving).toBe(false);
    // Let go at a pixel a millisecond: some 490 pixels more.
    expect(at).toBeCloseTo(100 + 490, -1);
  });

  it('goes the other way as well', () => {
    draw(0, -200, 100);
    run();
    expect(at).toBeCloseTo(-200 - 990, -1);
  });

  it('stays where it is set down: a hand that stopped, or was slow, throws nothing', () => {
    draw(0, 100, 100, false);
    now += 200;
    glide.letGo();
    expect(glide.moving).toBe(false);
    draw(100, 102, 100);
    expect(glide.moving).toBe(false);
    expect(at).toBe(102);
  });

  it('stops under a hand that takes hold of it', () => {
    draw(0, 100, 100);
    run(10);
    const caught = at;
    glide.hold(0);
    expect(glide.moving).toBe(false);
    run();
    expect(at).toBe(caught);
  });

  it('ends at an end of what there is, as against a wall', () => {
    ends = [-1e6, 150];
    draw(0, 100, 100);
    run();
    expect(at).toBe(150);
    expect(glide.moving).toBe(false);
  });

  it('takes a throw the same way on top of the glide it was caught in: so a long piece is leafed through', () => {
    draw(0, 100, 100);
    run();
    const once = at - 100;

    at = 0;
    draw(0, 100, 100);
    run(5);
    const before = at;
    draw(0, 100, 100);
    run();
    expect(at - before - 100).toBeGreaterThan(once * 1.5);
  });

  it('does not add a glide it was caught in to a throw the other way, or to a slow one', () => {
    draw(0, 100, 100);
    run(5);
    const before = at;
    draw(0, -100, 100);
    run();
    expect(at - before + 100).toBeCloseTo(-490, -1);
  });

  it('does not glide for whoever has asked for less motion', () => {
    still = true;
    draw(0, 100, 100);
    expect(glide.moving).toBe(false);
    expect(at).toBe(100);
  });

  it('is the same whatever the frames: by the clock, not by their count', () => {
    draw(0, 100, 100);
    run();
    const smooth = at;

    at = 0;
    draw(0, 100, 100);
    // A page that draws rarely: a frame every 100 ms.
    for (let frame = 0; frames.length > 0 && frame < 500; frame++) {
      now += 100;
      frames.splice(0).forEach((step) => step());
    }
    expect(at).toBeCloseTo(smooth, 0);
  });
});
