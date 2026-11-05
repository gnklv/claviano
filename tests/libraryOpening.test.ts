import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScoreParser } from '../src/application/ports/ScoreParser';
import { demoPieceId, Library } from '../src/application/use-cases/Library';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { OpenScore, type DemoPiece } from '../src/application/use-cases/OpenScore';
import { Playback } from '../src/application/use-cases/Playback';
import { contentId } from '../src/domain/contentId';
import { createScore, type Score } from '../src/domain/score';
import { FakeAudio, FakePieceShelf, FakeTicker } from './fakes';

const piece = (title: string): Score => createScore(title, [{ pitch: 60, start: 0, duration: 1, beat: 0, beats: 1, velocity: 0.8, hand: 'right' }], [0]);
const tunes: ScoreParser = { canParse: (name) => name.endsWith('.tune'), parse: (_, title) => piece(title) };
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe('opening the latest piece asked for', () => {
  it.each([
    ['file', 'opens'],
    ['file', 'fails'],
    ['list', 'opens'],
    ['list', 'fails'],
  ] as const)('ignores the earlier demo while waiting for shelf %s, even when the demo %s', async (waiting, outcome) => {
    const fetched = pending<Score>();
    const loadDemo = vi.fn(() => fetched.promise);
    const demo: DemoPiece = { id: 'slow', load: loadDemo };
    const shelf = new FakePieceShelf();
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    const open = new OpenScore(playback, new LoadScore([tunes]));
    const library = new Library(shelf, open, playback, [demo]);
    await library.load();
    await library.openFile('Saved.tune', bytes('saved'));
    await library.openFile('Current.tune', bytes('current'));
    const current = playback.score;
    const currentId = library.current;
    const obsolete = library.open(demoPieceId(demo));
    await Promise.resolve();
    expect(loadDemo).toHaveBeenCalledOnce();

    const file = pending<ArrayBuffer | null>();
    const list = pending<Awaited<ReturnType<FakePieceShelf['list']>>>();
    if (waiting === 'file') vi.spyOn(shelf, 'file').mockReturnValueOnce(file.promise);
    else {
      vi.spyOn(shelf, 'list').mockReturnValueOnce(list.promise);
      void library.load();
    }
    const changes = vi.fn();
    open.onChange(changes);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const latest = library.open(contentId(bytes('saved')));
    await Promise.resolve();

    if (outcome === 'opens') fetched.resolve(piece('Obsolete demo'));
    else fetched.reject(new Error('HTTP 500'));
    await obsolete;
    expect(playback.score).toBe(current);
    expect(library.current).toBe(currentId);
    expect(open.demo).toBeNull();
    expect(open.failure).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();

    if (waiting === 'file') file.resolve(bytes('saved'));
    else list.resolve([...shelf.pieces.values()]);
    await latest;
    expect(playback.score?.title).toBe('Saved');
    expect(library.current).toBe(contentId(bytes('saved')));
  });
});

describe('cancelling a pending opening', () => {
  it.each(['opens', 'fails'] as const)('keeps the open demo and its last failure when the cancelled demo %s', async (outcome) => {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    const open = new OpenScore(playback, new LoadScore([tunes]));
    const current: DemoPiece = { id: 'current', load: () => piece('Current demo') };
    await open.openDemo(current);
    open.openFile('Unsupported.jpg', bytes('not a score'));
    const score = playback.score;
    const failure = open.failure;
    const fetched = pending<Score>();
    const obsolete = open.openDemo({ id: 'obsolete', load: () => fetched.promise });
    const changes = vi.fn();
    open.onChange(changes);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    open.cancelPending();
    expect(playback.score).toBe(score);
    expect(open.demo).toBe(current);
    expect(open.failure).toBe(failure);
    expect(changes).not.toHaveBeenCalled();

    if (outcome === 'opens') fetched.resolve(piece('Obsolete demo'));
    else fetched.reject(new Error('HTTP 500'));
    await obsolete;
    expect(playback.score).toBe(score);
    expect(open.demo).toBe(current);
    expect(open.failure).toBe(failure);
    expect(changes).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
