import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { played } from './layerScoreFixtures';
import { FakeAudio, FakeTicker } from './fakes';

function setup() {
  const audio = new FakeAudio();
  const ticker = new FakeTicker();
  const playback = new Playback(audio, ticker);
  const score = createScore('Original', [played(48, 0, 0, { duration: 4, beats: 4, hand: 'left' }), played(72, 0, 0), played(74, 1, 1)], [0]);
  playback.load(score);
  return { audio, ticker, playback, score };
}

describe('playback note selection', () => {
  it('plays selected original indices together with the enabled hands without replacing the score', async () => {
    const { audio, playback, score } = setup();
    playback.setNoteSelection([0, 1]);
    playback.setHandEnabled('left', false);
    await playback.play();
    expect(audio.played.map((note) => note.pitch)).toEqual([72]);
    expect(playback.score).toBe(score);
    expect(playback.isNoteSelected(0)).toBe(true);
    expect(playback.isNoteSelected(2)).toBe(false);
  });

  it('omits unselected tails when seeking into a held note', async () => {
    const { audio, playback } = setup();
    playback.setNoteSelection([2]);
    playback.seek(1);
    await playback.play();
    expect(audio.played.map((note) => note.pitch)).toEqual([74]);
  });

  it('keeps a selected tail when starting a loop after its original attack', async () => {
    const { audio, playback } = setup();
    playback.setNoteSelection([0]);
    playback.setLoop({ start: 1, end: 2 });
    await playback.play();
    expect(audio.played).toMatchObject([{ pitch: 48, duration: 1 }]);
  });

  it('copies and validates the selection and clears it when a piece is loaded', () => {
    const { playback, score } = setup();
    const indices = [2, 0, 2];
    playback.setNoteSelection(indices);
    indices.push(1);
    expect(playback.noteSelection).toEqual([0, 2]);
    for (const indices of [[-1], [0.5], [3]]) expect(() => playback.setNoteSelection(indices)).toThrow(RangeError);
    expect(playback.noteSelection).toEqual([0, 2]);
    playback.load(score);
    expect(playback.noteSelection).toBeNull();
    expect(playback.isNoteSelected(1)).toBe(true);
  });

  it('pauses and cuts scheduled sound safely when the selection changes during playback', async () => {
    const { audio, playback } = setup();
    await playback.play();
    audio.time = 0.2;
    playback.setNoteSelection([2]);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBe(0.2);
    expect(audio.stops).toBe(1);
  });

  it('cancels a pending audio start when the selection changes', async () => {
    const { audio, playback } = setup();
    let ready!: () => void;
    audio.resume = () => new Promise<void>((resolve) => { ready = resolve; });
    const starting = playback.play();
    playback.setNoteSelection([1]);
    ready();
    await starting;
    expect(playback.playing).toBe(false);
    expect(audio.played).toEqual([]);
  });
});
