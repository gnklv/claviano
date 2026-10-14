import { beforeEach, describe, expect, it } from 'vitest';
import { FreePlay } from '../src/application/use-cases/FreePlay';
import { Playback } from '../src/application/use-cases/Playback';
import { Recorder } from '../src/application/use-cases/Recorder';
import { restWhenPutAway } from '../src/application/use-cases/restWhenPutAway';
import { odeToJoy } from '../src/demo/odeToJoy';
import { FakeAudio, FakeTicker } from './fakes';

/* The page put away (another tab, the window out of sight, the app left on a phone): what sounds comes to rest. */

let audio: FakeAudio;
let playback: Playback;
let play: FreePlay;
let recorder: Recorder;
let putAway: () => void;

beforeEach(() => {
  audio = new FakeAudio();
  playback = new Playback(audio, new FakeTicker());
  play = new FreePlay(audio);
  recorder = new Recorder(play, audio, new FakeTicker());
  recorder.setMetronome(false);
  putAway = restWhenPutAway(playback, recorder);
});

describe('when the page is put away', () => {
  it('pauses the piece where it is, to be gone on with from there', async () => {
    playback.load(odeToJoy('Ode to Joy'));
    await playback.play();
    audio.time = 2;
    const place = playback.position;
    expect(place).toBeGreaterThan(0);
    putAway();
    expect(playback.playing).toBe(false);
    expect(playback.position).toBeCloseTo(place);
  });

  it('ends a take being recorded, and keeps what was played of it', () => {
    recorder.arm();
    play.press(60);
    audio.time = 1;
    play.release(60);
    expect(recorder.state).toBe('recording');
    putAway();
    expect(recorder.state).toBe('recorded');
    expect(recorder.take?.notes.map((note) => note.pitch)).toEqual([60]);
  });

  it('stops a take being listened to', () => {
    recorder.arm();
    play.press(60);
    audio.time = 1;
    play.release(60);
    recorder.stop();
    recorder.listen();
    expect(recorder.listening).toBe(true);
    putAway();
    expect(recorder.listening).toBe(false);
    expect(recorder.state).toBe('recorded');
  });

  it('changes nothing where nothing sounds', () => {
    putAway();
    expect([playback.playing, recorder.state]).toEqual([false, 'idle']);
  });
});
