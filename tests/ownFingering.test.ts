// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { noteOnPage, playedFingers, playedOf, withOwnFingers } from '../src/domain/fingering/own';
import { OwnFingering } from '../src/application/use-cases/OwnFingering';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore } from '../src/domain/score';
import { FakeAudio, FakeTicker } from './fakes';
import { attributes, note, parser, score } from './musicXmlScore';

/* Fingers set by hand at the notes of a piece. */

const piece = (title: string) => createScore(title, [{ pitch: 60, start: 0, duration: 1, beat: 0, beats: 1, velocity: 0.8, hand: 'right' }], [0]);
const DO = { beat: 0, pitch: 60, hand: 'right' as const };
const RE = { beat: 1, pitch: 62, hand: 'right' as const };

describe('one’s own fingering', () => {
  it('sets a finger at a note in place of the one before, and takes it away', () => {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    playback.load(piece('one'));
    const fingering = new OwnFingering(playback);
    fingering.setFinger(DO, 1);
    fingering.setFinger(RE, 2);
    fingering.setFinger(DO, 3);
    expect(fingering.all).toEqual([
      { beat: 1, pitch: 62, finger: 2 },
      { beat: 0, pitch: 60, finger: 3 },
    ]);
    fingering.setFinger(RE, null);
    expect(fingering.all).toEqual([{ beat: 0, pitch: 60, finger: 3 }]);
  });

  it('is not carried over to another piece', () => {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    playback.load(piece('one'));
    const fingering = new OwnFingering(playback);
    fingering.setFinger(DO, 1);
    playback.load(piece('two'));
    expect(fingering.all).toEqual([]);
  });
});

describe('a played note and its note on the page', () => {
  // ‖: C D :‖ E, a half note each: the repeat plays C D C D E, printed once.
  const repeated = () =>
    parser.parse(
      score(`
        <measure number="1"><barline location="left"><repeat direction="forward"/></barline>${attributes()}${note('C', 4, 4)}${note('D', 4, 4)}<barline location="right"><repeat direction="backward"/></barline></measure>
        <measure number="2">${note('E', 4, 8)}</measure>`),
      'test',
    );

  it('finds the note of the page a played note plays, on either pass', () => {
    const piece = repeated();
    expect(piece.notes.map((each) => each.pitch)).toEqual([60, 62, 60, 62, 64]);
    expect(noteOnPage(piece, 3)).toEqual({ beat: 2, pitch: 62, hand: 'right' });
    expect(noteOnPage(piece, 4)).toEqual({ beat: 4, pitch: 64, hand: 'right' });
    expect(noteOnPage(piece, 9)).toBeNull();
  });

  it('finds every pass that plays a note of the page, and gives each its finger', () => {
    const piece = withOwnFingers(repeated(), [{ beat: 2, pitch: 62, finger: 3 }]);
    expect(playedOf(piece, { beat: 2, pitch: 62, hand: 'right' })).toEqual([1, 3]);
    expect(playedFingers(piece).map((each) => each?.text ?? null)).toEqual([null, '3', null, '3', null]);
  });
});
