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

describe('opening generated music', () => {
  it.each(['opens', 'fails'] as const)('replaces a pending demo that later %s', async (outcome) => {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    const open = new OpenScore(playback, new LoadScore([tunes]));
    open.openFile('bad.jpg', bytes('bad'));
    const fetched = pending<Score>();
    const obsolete = open.openDemo({ id: 'slow', load: () => fetched.promise });
    const generated = piece('Warmup');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    open.openGenerated(generated);
    if (outcome === 'opens') fetched.resolve(piece('Obsolete'));
    else fetched.reject(new Error('obsolete'));
    await obsolete;
    expect(playback.score).toBe(generated);
    expect(open.demo).toBeNull();
    expect(open.failure).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it.each(['file', 'list', 'bytes'] as const)('cancels a pending %s before generated music opens', async (waiting) => {
    const shelf = new FakePieceShelf();
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    const open = new OpenScore(playback, new LoadScore([tunes]));
    const library = new Library(shelf, open, playback, []);
    await library.load();
    await library.openFile('Saved.tune', bytes('saved'));
    const data = pending<ArrayBuffer>();
    const list = pending<Awaited<ReturnType<FakePieceShelf['list']>>>();
    let obsolete: Promise<void>;
    if (waiting === 'bytes') obsolete = library.openFile('Slow.tune', data.promise);
    else {
      if (waiting === 'file') vi.spyOn(shelf, 'file').mockReturnValueOnce(data.promise);
      else { vi.spyOn(shelf, 'list').mockReturnValueOnce(list.promise); void library.load(); }
      obsolete = library.open(contentId(bytes('saved')));
      await Promise.resolve();
    }
    const changed = vi.fn();
    library.onChange(changed);
    library.cancelPending();
    expect(changed).not.toHaveBeenCalled();
    const generated = piece('Warmup');
    open.openGenerated(generated);
    data.resolve(bytes('saved'));
    list.resolve([...shelf.pieces.values()]);
    await obsolete;
    expect(playback.score).toBe(generated);
    expect(library.current).toBeNull();
    expect(open.failure).toBeNull();
  });

  it.each([false, true])('ignores a rejected file read after cancellation: %s', async (cancelled) => {
    const playback = new Playback(new FakeAudio(), new FakeTicker());
    const open = new OpenScore(playback, new LoadScore([tunes]));
    const library = new Library(new FakePieceShelf(), open, playback, []);
    const read = pending<ArrayBuffer>();
    const opening = library.openFile('Unreadable.tune', read.promise);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (cancelled) library.cancelPending();
    read.reject(new Error('read failed'));
    await opening;
    expect(open.failure).toEqual(cancelled ? null : { source: { file: 'Unreadable.tune' }, reason: 'unknown' });
    expect(errors).toHaveBeenCalledTimes(cancelled ? 0 : 1);
  });
});

it('identifies generated music during load notifications and clears it only when another piece opens', () => {
  const playback = new Playback(new FakeAudio(), new FakeTicker());
  const open = new OpenScore(playback, new LoadScore([tunes]));
  const generated = piece('Warmup');
  const seen: boolean[] = [];
  playback.onChange(() => { if (playback.score === generated) seen.push(open.isGenerated(generated)); });
  open.openGenerated(generated);
  expect(seen).toEqual([true]);
  open.openFile('bad.jpg', bytes('bad'));
  expect(open.isGenerated(generated)).toBe(true);
  open.openFile('Good.tune', bytes('good'));
  expect(open.isGenerated(generated)).toBe(false);
});

it('keeps the later demo opening attached to its shelf identity when old file bytes arrive', async () => {
  const playback = new Playback(new FakeAudio(), new FakeTicker());
  const open = new OpenScore(playback, new LoadScore([tunes]));
  const fetched = pending<Score>();
  const demo: DemoPiece = { id: 'later', load: () => fetched.promise };
  const library = new Library(new FakePieceShelf(), open, playback, [demo]);
  const read = pending<ArrayBuffer>();
  const obsolete = library.openFile('Slow.tune', read.promise);
  const latest = library.open(demoPieceId(demo));
  await Promise.resolve();
  read.resolve(bytes('slow'));
  await obsolete;
  fetched.resolve(piece('Later demo'));
  await latest;
  expect(playback.score?.title).toBe('Later demo');
  expect(library.current).toBe(demoPieceId(demo));
});
