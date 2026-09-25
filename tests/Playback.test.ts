import { describe, expect, it } from 'vitest';
import type { AudioOutput } from '../src/application/ports/AudioOutput';
import type { Ticker } from '../src/application/ports/Ticker';
import { Playback } from '../src/application/use-cases/Playback';
import type { Hand, Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';

class FakeAudio implements AudioOutput {
  time = 0;
  played: { pitch: number; at: number; duration: number }[] = [];
  stops = 0;
  now = () => this.time;
  resume = async () => {};
  playNote(pitch: number, _velocity: number, at: number, duration: number): void {
    this.played.push({ pitch, at, duration });
  }
  stopAll(): void {
    this.stops++;
  }
}

class FakeTicker implements Ticker {
  private callback: (() => void) | null = null;
  start(onTick: () => void): () => void {
    this.callback = onTick;
    return () => (this.callback = null);
  }
  tick(): void {
    this.callback?.();
  }
}

const note = (pitch: number, start: number, duration = 0.5, hand: Hand = 'right'): Note => ({
  pitch,
  start,
  duration,
  velocity: 0.8,
  hand,
});

/** One note per second, bars every 2 seconds. */
const score = createScore(
  'test',
  [note(60, 0), note(62, 1), note(64, 2), note(65, 3, 0.5, 'left')],
  [0, 2],
);

function setup() {
  const audio = new FakeAudio();
  const ticker = new FakeTicker();
  const playback = new Playback(audio, ticker);
  playback.load(score);
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.025) {
      audio.time += 0.025;
      ticker.tick();
    }
  };
  return { audio, ticker, playback, advance };
}

describe('Playback', () => {
  it('schedules only the notes within the lookahead window', async () => {
    const { audio, playback, advance } = setup();
    await playback.play();
    expect(audio.played.map((n) => n.pitch)).toEqual([60]);

    advance(1);
    expect(audio.played.map((n) => n.pitch)).toEqual([60, 62]);
    expect(audio.played[1].at).toBeCloseTo(1);
  });

  it('stretches time when the tempo is lowered', async () => {
    const { audio, playback, advance } = setup();
    playback.setTempo(0.5);
    await playback.play();
    advance(2);
    expect(audio.played[1]).toMatchObject({ pitch: 62 });
    expect(audio.played[1].at).toBeCloseTo(2);
    expect(audio.played[1].duration).toBeCloseTo(1);
    expect(playback.position).toBeCloseTo(1, 1);
  });

  it('does not play muted hands', async () => {
    const { audio, playback, advance } = setup();
    playback.setHandEnabled('left', false);
    await playback.play();
    advance(4);
    expect(audio.played.map((n) => n.pitch)).toEqual([60, 62, 64]);
  });

  it('wraps seamlessly around a loop', async () => {
    const { audio, playback, advance } = setup();
    playback.setLoop({ start: 0, end: 2 });
    await playback.play();
    advance(2.5);

    const pitches = audio.played.map((n) => n.pitch);
    expect(pitches).toEqual([60, 62, 60]);
    expect(audio.played[2].at).toBeCloseTo(2);
    expect(playback.position).toBeGreaterThanOrEqual(0);
    expect(playback.position).toBeLessThan(2);
  });

  it('stops at the end of the score', async () => {
    const { playback, advance } = setup();
    await playback.play();
    advance(4);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBeCloseTo(score.duration);
  });

  it('restarts from the beginning after reaching the end', async () => {
    const { audio, playback, advance } = setup();
    await playback.play();
    advance(4);
    audio.played = [];
    await playback.play();
    expect(audio.played.map((n) => n.pitch)).toEqual([60]);
  });

  it('keeps the position when paused and resumed', async () => {
    const { audio, playback, advance } = setup();
    await playback.play();
    advance(1.5);
    playback.pause();
    const paused = playback.position;
    audio.time += 10;
    expect(playback.position).toBe(paused);

    audio.played = [];
    await playback.play();
    advance(0.6);
    expect(audio.played.map((n) => n.pitch)).toEqual([64]);
  });
});
