import { describe, expect, it } from 'vitest';
import { Playback } from '../src/application/use-cases/Playback';
import { performNotation, plainNotesOf } from '../src/domain/notation/performance';
import { FakeAudio, FakeTicker } from './fakes';
import { notation, written } from './layerScoreFixtures';

function setup() {
  const audio = new FakeAudio();
  const playback = new Playback(audio, new FakeTicker());
  const score = performNotation(notation([
    written(0, 72, { beats: 4, ornaments: [{ kind: 'trill', accidentalAbove: null, accidentalBelow: null, below: false }] }),
    written(0, 48, { beats: 4, staff: 2, voice: '2', hand: 'left' }),
  ]));
  playback.load(score);
  return { playback, audio, score, plain: plainNotesOf(score) };
}

describe('the notes used to demonstrate a practice task', () => {
  it('plays the sustained principal and exposes the same event list for drawing without reopening the piece', async () => {
    const { playback, audio, score, plain } = setup();
    playback.setPracticeNotes(plain, [1]);
    expect(playback.score).toBe(score);
    expect(playback.performanceScore?.notes).toBe(plain);
    expect(playback.performanceScore?.notation).toBe(score.notation);
    expect(playback.performanceScore?.timeMap).toBe(score.timeMap);
    expect(playback.plain).toBe(true);
    const view = playback.performanceScore;
    playback.setNoteSelection([0, 1]);
    expect(playback.performanceScore).toBe(view);
    playback.setHandEnabled('left', false);
    await playback.play();
    expect(audio.played).toMatchObject([{ pitch: 72, duration: 4 }]);
  });

  it('resumes a sustained principal after seeking into it, instead of a short trill attack', async () => {
    const { playback, audio, plain } = setup();
    playback.setPracticeNotes(plain, [1]);
    playback.seek(2);
    await playback.play();
    expect(audio.played).toMatchObject([{ pitch: 72, duration: 2 }]);
  });

  it('changes the event stream and selection together and validates against the new event list', () => {
    const { playback, score, plain } = setup();
    expect(score.notes.length).toBeGreaterThan(plain.length);
    expect(() => playback.setPracticeNotes(plain, [plain.length])).toThrow(RangeError);
    expect(playback.performanceScore).toBe(score);
    expect(playback.noteSelection).toBeNull();
    playback.setPracticeNotes(plain, [1]);
    playback.setPracticeNotes(null, null);
    expect(playback.performanceScore).toBe(score);
    expect(playback.noteSelection).toBeNull();
    expect(playback.plain).toBe(false);
    playback.setPracticeNotes(plain, [1]);
    playback.load(score);
    expect(playback.performanceScore).toBe(score);
    expect(playback.noteSelection).toBeNull();
    expect(playback.plain).toBe(false);
  });

  it('stops scheduled sound even if the same selection indices are used by the new stream', async () => {
    const { playback, audio, plain } = setup();
    playback.setNoteSelection([1]);
    await playback.play();
    audio.time = 0.2;
    playback.setPracticeNotes(plain, [1]);
    expect(playback.playing).toBe(false);
    expect(playback.position).toBeCloseTo(0.2);
    expect(audio.stops).toBe(1);
  });

  it('cancels a pending audio start when the demonstrated stream changes', async () => {
    const { playback, audio, plain } = setup();
    playback.setNoteSelection([1]);
    let ready!: () => void;
    audio.resume = () => new Promise<void>((resolve) => { ready = resolve; });
    const starting = playback.play();
    playback.setPracticeNotes(plain, [1]);
    ready();
    await starting;
    expect(playback.playing).toBe(false);
    expect(audio.played).toEqual([]);
  });
});
