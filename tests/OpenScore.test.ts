import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoreLoadError, type ScoreParser } from '../src/application/ports/ScoreParser';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { OpenScore, type DemoPiece } from '../src/application/use-cases/OpenScore';
import { Playback } from '../src/application/use-cases/Playback';
import { createScore, type Score } from '../src/domain/score';
import { fetchScore } from '../src/infrastructure/parsers/fetchScore';
import { FakeAudio, FakeTicker } from './fakes';

/*
 * Opening a piece, from a file or from the demos, with a stand-in reader of ".tune" files: the
 * text of the file says what happens ("broken", "odd", "crash"; anything else is a piece).
 */

const piece = (title: string): Score => createScore(title, [{ pitch: 60, start: 0, duration: 1, beat: 0, beats: 1, velocity: 0.8, hand: 'right' }], [0]);

const tunes: ScoreParser = {
  canParse: (fileName) => fileName.endsWith('.tune'),
  parse(data, title) {
    const text = new TextDecoder().decode(data);
    if (text === 'broken') throw new ScoreLoadError('invalid-file', 'broken');
    if (text === 'odd') throw new ScoreLoadError('unsupported-feature', 'odd');
    if (text === 'crash') throw new TypeError('a bug of ours');
    return piece(title);
  },
};
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

let playback: Playback;
let open: OpenScore;
let changes: number;

beforeEach(() => {
  playback = new Playback(new FakeAudio(), new FakeTicker());
  open = new OpenScore(playback, new LoadScore([tunes]));
  changes = 0;
  open.onChange(() => changes++);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenScore', () => {
  it('has nothing open and nothing failed to begin with', () => {
    expect(playback.score).toBeNull();
    expect(open.demo).toBeNull();
    expect(open.failure).toBeNull();
  });

  describe('a file', () => {
    it('goes to playback, named after the file without its extension', () => {
      open.openFile('My song.tune', bytes('notes'));
      expect(playback.score?.title).toBe('My song');
      expect(open.failure).toBeNull();
      expect(open.demo).toBeNull();
      expect(changes).toBe(1);
    });

    it('named with underscores reads with spaces', () => {
      open.openFile('Sonate_No._14_Moonlight__1st_Movement.tune', bytes('notes'));
      expect(playback.score?.title).toBe('Sonate No. 14 Moonlight 1st Movement');
    });

    it('of a kind nobody reads fails as an unsupported format', () => {
      open.openFile('photo.jpg', bytes('notes'));
      expect(open.failure).toEqual({ source: { file: 'photo.jpg' }, reason: 'unsupported-format' });
      expect(playback.score).toBeNull();
      expect(changes).toBe(1);
    });

    it('that its reader cannot read fails with the reader’s reason', () => {
      open.openFile('a.tune', bytes('broken'));
      expect(open.failure?.reason).toBe('invalid-file');
      open.openFile('b.tune', bytes('odd'));
      expect(open.failure).toEqual({ source: { file: 'b.tune' }, reason: 'unsupported-feature' });
      expect(console.error).not.toHaveBeenCalled();
    });

    it('that breaks its reader fails for an unknown reason, and the breakage is logged', () => {
      open.openFile('a.tune', bytes('crash'));
      expect(open.failure).toEqual({ source: { file: 'a.tune' }, reason: 'unknown' });
      expect(console.error).toHaveBeenCalledOnce();
    });

    it('that fails leaves the piece that was open in place', () => {
      open.openFile('good.tune', bytes('notes'));
      const score = playback.score;
      open.openFile('bad.tune', bytes('broken'));
      expect(playback.score).toBe(score);
      expect(open.failure).not.toBeNull();
    });

    it('that opens clears the failure before it', () => {
      open.openFile('bad.tune', bytes('broken'));
      open.openFile('good.tune', bytes('notes'));
      expect(open.failure).toBeNull();
    });
  });

  describe('a demo', () => {
    const ode: DemoPiece = { id: 'ode', load: () => piece('Ode') };

    it('goes to playback and is known as the open demo', async () => {
      await open.openDemo(ode);
      expect(playback.score?.title).toBe('Ode');
      expect(open.demo).toBe(ode);
      expect(changes).toBe(1);
    });

    it('is no longer the open one once a file is opened, or another piece is loaded past it', async () => {
      await open.openDemo(ode);
      open.openFile('song.tune', bytes('notes'));
      expect(open.demo).toBeNull();

      await open.openDemo(ode);
      playback.load(piece('Something else'));
      expect(open.demo).toBeNull();
    });

    it('that fails to load fails for an unknown reason, by its own name', async () => {
      const lost: DemoPiece = { id: 'lost', load: () => Promise.reject(new Error('HTTP 404')) };
      await open.openDemo(ode);
      await open.openDemo(lost);
      expect(open.failure).toEqual({ source: { demo: lost }, reason: 'unknown' });
      expect(console.error).toHaveBeenCalledOnce();
      // The demo opened before is still there.
      expect(open.demo).toBe(ode);
    });

    it('that arrives after something else was asked for is dropped', async () => {
      let arrive!: (score: Score) => void;
      const slow: DemoPiece = { id: 'slow', load: () => new Promise((resolve) => (arrive = resolve)) };
      const opening = open.openDemo(slow);
      open.openFile('song.tune', bytes('notes'));
      arrive(piece('Slow demo'));
      await opening;
      expect(playback.score?.title).toBe('song');
      expect(open.demo).toBeNull();
    });

    it('that fails after something else was asked for is not reported', async () => {
      let fail!: (error: Error) => void;
      const slow: DemoPiece = { id: 'slow', load: () => new Promise((_, reject) => (fail = reject)) };
      const opening = open.openDemo(slow);
      open.openFile('song.tune', bytes('notes'));
      fail(new Error('HTTP 500'));
      await opening;
      expect(open.failure).toBeNull();
    });
  });

  it('stops telling a listener that has left', () => {
    const stop = open.onChange(() => changes++);
    stop();
    open.openFile('song.tune', bytes('notes'));
    expect(changes).toBe(1);
  });
});

describe('fetchScore', () => {
  it('fetches the file and reads it with the given reader', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response('notes'));
    });
    const score = await fetchScore('/demos/song.tune', tunes, 'Song');
    expect(asked).toEqual(['/demos/song.tune']);
    expect(score.title).toBe('Song');
  });

  it('fails when the server does not have it, rather than reading the error page', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('not found', { status: 404 })));
    await expect(fetchScore('/demos/song.tune', tunes, 'Song')).rejects.toThrow('HTTP 404');
  });

  it('fails as its reader fails', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('broken')));
    await expect(fetchScore('/demos/song.tune', tunes, 'Song')).rejects.toBeInstanceOf(ScoreLoadError);
  });
});
