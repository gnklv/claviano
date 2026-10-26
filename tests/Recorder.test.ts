import { beforeEach, describe, expect, it } from 'vitest';
import { FreePlay } from '../src/application/use-cases/FreePlay';
import { Recorder } from '../src/application/use-cases/Recorder';
import { FakeAudio, FakeTicker } from './fakes';

/* Recording what is played, on a clock set by hand. At the starting tempo (80) a beat is 0.75 s, a bar of 4/4 three seconds. */

let audio: FakeAudio;
let ticker: FakeTicker;
let play: FreePlay;
let recorder: Recorder;
/** A key held from one moment to another. */
const note = (pitch: number, from: number, to: number) => {
  audio.time = from;
  play.press(pitch);
  audio.time = to;
  play.release(pitch);
};
/** The clock moves on, and the metronome is given its turns. */
const wait = (until: number) => {
  for (let time = audio.time; time <= until; time += 0.05) {
    audio.time = time;
    ticker.tick();
  }
  audio.time = until;
};
const rounded = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);
const taken = () => recorder.take?.notes.map(({ pitch, start, end }) => [pitch, rounded(start), rounded(end)]);

beforeEach(() => {
  audio = new FakeAudio();
  ticker = new FakeTicker();
  play = new FreePlay(audio);
  recorder = new Recorder(play, audio, ticker);
});

describe('the recorder', () => {
  it('is idle to begin with, at 80 to the minute in 4/4, with the metronome on, and records nothing of what is played', () => {
    expect([recorder.state, recorder.tempo, recorder.meter, recorder.metronome]).toEqual(['idle', 80, '4/4', true]);
    note(60, 0, 1);
    expect(recorder.take).toBeNull();
    expect(audio.clicks).toEqual([]);
  });

  describe('without the metronome', () => {
    beforeEach(() => recorder.setMetronome(false));

    it('begins the take at the first note, however long after the button', () => {
      recorder.arm();
      expect(recorder.state).toBe('armed');
      note(60, 5, 5.5);
      expect(recorder.state).toBe('recording');
      note(64, 6, 7);
      expect(taken()).toEqual([
        [60, 0, 0.5],
        [64, 1, 2],
      ]);
      expect(audio.clicks).toEqual([]);
      expect(recorder.bar).toBeNull();
    });

    it('ends at stop: the take is as long as it ran, and keys still down come up with it', () => {
      recorder.arm();
      note(60, 1, 2);
      audio.time = 2.5;
      play.press(64);
      audio.time = 4;
      recorder.stop();
      expect(recorder.state).toBe('recorded');
      expect(taken()).toEqual([
        [60, 0, 1],
        [64, 1.5, 3],
      ]);
      expect(recorder.take).toMatchObject({ seconds: 3, tempo: 80, meter: '4/4', onTheBeat: false });
      // What is played after is not the take's.
      play.release(64);
      note(67, 5, 6);
      expect(taken()).toHaveLength(2);
    });

    it('records chords, and the same key struck again', () => {
      recorder.arm();
      audio.time = 1;
      play.press(60);
      play.press(64);
      audio.time = 2;
      play.release(60);
      play.release(64);
      note(60, 2.5, 3);
      expect(taken()).toEqual([
        [60, 0, 1],
        [64, 0, 1],
        [60, 1.5, 2],
      ]);
    });
  });

  describe('to the metronome', () => {
    it('clicks from the button on, the first beat of each bar marked', () => {
      recorder.arm();
      wait(4);
      const beats = audio.clicks.map((click) => [rounded(click.at), click.accent]);
      expect(beats.slice(0, 6)).toEqual([
        [0.1, true],
        [0.85, false],
        [1.6, false],
        [2.35, false],
        [3.1, true],
        [3.85, false],
      ]);
    });

    it('begins the take at the bar line of the bar the first note falls in: no empty bars before it', () => {
      recorder.arm();
      wait(7);
      // Bars begin at 0.1, 3.1, 6.1: the first note is on the second beat of the third.
      note(60, 6.85, 7.2);
      expect(taken()).toEqual([[60, 0.75, 1.1]]);
      wait(9.5);
      expect(recorder.bar).toBe(2);
      expect(recorder.take?.onTheBeat).toBe(true);
    });

    it('takes a first note played a touch early for the bar it comes in on', () => {
      recorder.arm();
      wait(3);
      note(60, 3.04, 3.5);
      expect(taken()).toEqual([[60, 0, 0.4]]);
    });

    it('stops clicking at stop, and has no take if nothing was played', () => {
      recorder.arm();
      wait(1);
      recorder.stop();
      const clicks = audio.clicks.length;
      wait(5);
      expect(audio.clicks).toHaveLength(clicks);
      expect([recorder.state, recorder.take]).toEqual(['idle', null]);
    });

    it('clicks in threes in 3/4, and in twos (dotted quarters) in 6/8', () => {
      recorder.setMeter('3/4');
      recorder.arm();
      wait(3);
      expect(audio.clicks.map((click) => click.accent).slice(0, 4)).toEqual([true, false, false, true]);
      recorder.stop();

      audio.clicks = [];
      recorder.setMeter('6/8');
      recorder.arm();
      wait(audio.time + 3);
      expect(audio.clicks.map((click) => click.accent).slice(0, 3)).toEqual([true, false, true]);
    });
  });

  it('sets the tempo within its limits, and nothing while a take is being recorded', () => {
    recorder.setTempo(500);
    expect(recorder.tempo).toBe(200);
    recorder.setTempo(1);
    expect(recorder.tempo).toBe(40);
    recorder.setTempo(96);
    recorder.arm();
    recorder.setTempo(120);
    recorder.setMeter('3/4');
    recorder.setMetronome(false);
    expect([recorder.tempo, recorder.meter, recorder.metronome]).toEqual([96, '4/4', true]);
  });

  it('throws a take away when asked, and when another is begun', () => {
    recorder.setMetronome(false);
    recorder.arm();
    note(60, 1, 2);
    recorder.stop();
    recorder.discard();
    expect([recorder.state, recorder.take]).toEqual(['idle', null]);

    recorder.arm();
    note(62, 3, 4);
    recorder.stop();
    recorder.arm();
    note(64, 5, 6);
    expect(taken()).toEqual([[64, 0, 1]]);
  });

  it('has a sheet to write on before a take: a bar with nothing in it, in the metre set; the take, once there is one', () => {
    expect(recorder.score('Mine')).toBeNull();
    recorder.setMeter('3/4');
    const empty = recorder.sheet('Mine');
    expect([empty.notes.length, empty.bars.length, empty.notation.timeSignatures[0]?.numerator]).toEqual([0, 1, 3]);
    recorder.setMetronome(false);
    recorder.arm();
    note(60, 0, 1);
    audio.time = 1.5;
    recorder.stop();
    expect(recorder.sheet('Mine').notes.map((written) => written.pitch)).toEqual([60]);
  });

  describe('a take that is there', () => {
    /** Three bars at 80 in 4/4 (three seconds each), without the metronome: a note in each, the last held over from the second. */
    beforeEach(() => {
      recorder.setMetronome(false);
      recorder.arm();
      note(60, 0, 1);
      note(62, 3, 4);
      note(64, 5.3, 7);
      audio.time = 7.5;
      recorder.stop();
    });

    it('is written down as a piece, under the name given', () => {
      const score = recorder.score('Mine');
      expect(score?.title).toBe('Mine');
      expect(score?.notes.map((written) => [written.pitch, written.beat])).toEqual([
        [60, 0],
        [62, 4],
        [64, 7],
      ]);
      expect(score?.bars).toHaveLength(3);
    });

    it('plays back as it is written, from a moment on, and stands at its end again when it has run', () => {
      expect(recorder.position).toBe(7.5);
      recorder.listen();
      expect(recorder.listening).toBe(true);
      expect(audio.played.map((played) => [played.pitch, rounded(played.at - 7.6)])).toEqual([
        [60, 0],
        [62, 3],
        [64, 5.25],
      ]);
      audio.time = 9.6;
      expect(rounded(recorder.position)).toBe(2);
      wait(20);
      expect(recorder.listening).toBe(false);
      expect(recorder.position).toBe(7.5);
    });

    it('stops playing back when asked, when another take is begun, and when it is thrown away', () => {
      for (const end of [() => recorder.stopListening(), () => recorder.arm(), () => recorder.discard()]) {
        recorder.listen();
        const stops = audio.stops;
        end();
        expect(recorder.listening).toBe(false);
        expect(audio.stops).toBe(stops + 1);
        if (recorder.state !== 'recorded') break;
      }
    });

    it('loses its last bar when asked: the notes written in it go, a note held into it ends at its line', () => {
      recorder.eraseLastBar();
      // (The third note is written at beat 7, in the second bar: it stays, and ends with the bar.)
      expect(taken()).toEqual([
        [60, 0, 1],
        [62, 3, 4],
        [64, 5.3, 6],
      ]);
      expect(recorder.take?.seconds).toBe(6);
      recorder.eraseLastBar();
      expect(taken()).toEqual([[60, 0, 1]]);
      // Its only bar erased, there is no take.
      recorder.eraseLastBar();
      expect([recorder.state, recorder.take]).toEqual(['idle', null]);
    });
  });

  it('tells its listeners of what changes, until they leave', () => {
    let changes = 0;
    const stop = recorder.onChange(() => changes++);
    recorder.setMetronome(false);
    recorder.arm();
    note(60, 1, 2);
    recorder.stop();
    expect(changes).toBe(5);
    stop();
    recorder.discard();
    expect(changes).toBe(5);
  });
});
