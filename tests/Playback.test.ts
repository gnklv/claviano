import { describe, expect, it } from 'vitest';
import type { AudioOutput, NoteToPlay } from '../src/application/ports/AudioOutput';
import type { Ticker } from '../src/application/ports/Ticker';
import { Playback } from '../src/application/use-cases/Playback';
import type { Hand, Note } from '../src/domain/note';
import { createScore } from '../src/domain/score';

class FakeAudio implements AudioOutput {
  time = 0;
  played: NoteToPlay[] = [];
  stops = 0;
  now = () => this.time;
  resume = async () => {};
  playNote(note: NoteToPlay): void {
    this.played.push(note);
  }
  pedalMoves: { at: number; down: boolean }[] = [];
  playPedal(at: number, down: boolean): void {
    this.pedalMoves.push({ at, down });
  }
  clicks: { at: number; accent: boolean }[] = [];
  playClick(at: number, accent: boolean): void {
    this.clicks.push({ at, accent });
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

/** At 60 BPM a beat lasts one second, so seconds and beats coincide. */
const note = (pitch: number, start: number, duration = 0.5, hand: Hand = 'right'): Note => ({
  pitch,
  start,
  duration,
  beat: start,
  beats: duration,
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

/** A bass note under the pedal and a melody note after it: the pedal holds the bass. */
const pedalled = createScore('pedal', [note(48, 0, 0.5, 'left'), note(64, 1, 0.5)], [0], { pedal: [{ start: 0, end: 2 }] });

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

  it('holds notes under the sustain pedal', async () => {
    const { audio, playback, advance } = setup();
    playback.load(pedalled);
    await playback.play();
    advance(1.5);
    expect(audio.played.map((n) => [n.pitch, n.duration])).toEqual([
      [48, 2],
      [64, 1],
    ]);
  });

  it('tells how long each key is held under the pedal, and when the pedal moves', async () => {
    const { audio, playback, advance } = setup();
    playback.load(pedalled);
    await playback.play();
    const startedAt = audio.played[0].at;
    advance(2.5);
    // The bass sounds for two seconds, but its key is down for half a second.
    expect(audio.played.map((n) => [n.pitch, n.duration, n.held])).toEqual([
      [48, 2, 0.5],
      [64, 1, 0.5],
    ]);
    expect(audio.pedalMoves).toEqual([
      { at: startedAt, down: true },
      { at: startedAt + 2, down: false },
    ]);
  });

  it('makes no pedal noise with the pedal off', async () => {
    const { audio, playback, advance } = setup();
    playback.load(pedalled);
    playback.setPedalEnabled(false);
    await playback.play();
    advance(2.5);
    expect(audio.pedalMoves).toEqual([]);
  });

  it('plays notes as long as their keys with the pedal off', async () => {
    const { audio, playback, advance } = setup();
    playback.load(pedalled);
    playback.setPedalEnabled(false);
    expect(playback.pedalEnabled).toBe(false);
    await playback.play();
    advance(1.5);
    expect(audio.played.map((n) => [n.pitch, n.duration])).toEqual([
      [48, 0.5],
      [64, 0.5],
    ]);
  });

  it('plays notes struck with the soft pedal quieter and duller', async () => {
    const { audio, playback, advance } = setup();
    playback.load(createScore('soft', [note(60, 0), note(62, 1)], [0], { softPedal: [{ start: 0.5, end: 2 }] }));
    await playback.play();
    advance(1.5);
    const [before, under] = audio.played;
    expect(before.soft).toBe(false);
    expect(under.soft).toBe(true);
    expect(under.velocity).toBeLessThan(before.velocity);
  });

  it('holds the keys caught by the middle pedal', async () => {
    const { audio, playback, advance } = setup();
    playback.load(createScore('sost', [note(36, 0, 1), note(72, 1)], [0], { sostenutoPedal: [{ start: 0.5, end: 3 }] }));
    await playback.play();
    advance(1.5);
    expect(audio.played.map((n) => [n.pitch, n.duration])).toEqual([
      [36, 3],
      [72, 0.5],
    ]);
  });

  describe('metronome and count-in', () => {
    /** Two bars of 4/4 whole notes at 60 BPM: a beat is a second. */
    const whole = (pitch: number, beat: number) => ({ ...note(pitch, beat, 4), beats: 4 });
    const twoBars = createScore('m', [whole(60, 0), whole(62, 4)], [0, 4], { barBeats: [0, 4] });

    it('clicks every beat while the metronome is on', async () => {
      const { audio, playback, advance } = setup();
      playback.load(twoBars);
      playback.setMetronomeEnabled(true);
      await playback.play();
      advance(2.5);
      expect(audio.clicks.map((c) => [Math.round(c.at * 10) / 10, c.accent])).toEqual([
        [0, true],
        [1, false],
        [2, false],
      ]);
    });

    it('does not click with the metronome off', async () => {
      const { audio, playback, advance } = setup();
      playback.load(twoBars);
      await playback.play();
      advance(2.5);
      expect(audio.clicks).toEqual([]);
    });

    it('counts in a bar before the music, which waits at its start', async () => {
      const { audio, playback, advance } = setup();
      playback.load(twoBars);
      playback.setCountInEnabled(true);
      playback.setTempo(0.5); // count-in follows the tempo: two seconds a beat
      await playback.play();
      expect(audio.clicks.map((c) => [c.at, c.accent])).toEqual([
        [0, true],
        [2, false],
        [4, false],
        [6, false],
      ]);
      expect(audio.played).toEqual([]);
      advance(3);
      expect(playback.position).toBe(0);
      expect(playback.countInBeat).toBe(2);
      advance(5.1);
      expect(playback.countInBeat).toBeNull();
      expect(audio.played[0]).toMatchObject({ pitch: 60 });
      expect(audio.played[0].at).toBeCloseTo(8);
    });
  });

  it('plays on the notes still sounding where it starts, for what is left of them', async () => {
    const { audio, playback } = setup();
    playback.load(createScore('held', [note(48, 0, 4, 'left'), note(60, 1, 0.5), note(64, 3, 1)], [0]));
    playback.seek(2);
    await playback.play();
    // The bass (0–4) still sounds at 2: two seconds of it. The note 1–1.5 is over.
    expect(audio.played[0]).toMatchObject({ pitch: 48, at: 0 });
    expect(audio.played[0].duration).toBeCloseTo(2);
    expect(audio.played.map((n) => n.pitch)).not.toContain(60);
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
