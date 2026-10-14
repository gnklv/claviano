import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreParser } from '../src/application/ports/ScoreParser';
import { ScoreLoadError } from '../src/application/ports/ScoreParser';
import { demoPieceId, Library } from '../src/application/use-cases/Library';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { OpenScore, type DemoPiece } from '../src/application/use-cases/OpenScore';
import { Playback } from '../src/application/use-cases/Playback';
import { contentId } from '../src/domain/contentId';
import { createScore, type Score } from '../src/domain/score';
import { FakeAudio, FakePieceShelf, FakeTicker } from './fakes';

/* The shelf of pieces, with a stand-in reader of ".tune" files ("broken" does not open) and a clock set by hand. */

const piece = (title: string): Score => createScore(title, [{ pitch: 60, start: 0, duration: 1, beat: 0, beats: 1, velocity: 0.8, hand: 'right' }], [0]);
const tunes: ScoreParser = {
  canParse: (fileName) => fileName.endsWith('.tune'),
  parse(data, title) {
    if (new TextDecoder().decode(data) === 'broken') throw new ScoreLoadError('invalid-file', 'broken');
    return piece(title);
  },
};
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
const demo: DemoPiece = { id: 'ode', load: () => piece('Ode') };

let playback: Playback;
let shelf: FakePieceShelf;
let library: Library;
let time: number;
const start = () => {
  playback = new Playback(new FakeAudio(), new FakeTicker());
  library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, [demo], () => time);
  return library.load();
};

beforeEach(async () => {
  shelf = new FakePieceShelf();
  time = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await start();
});

describe('contentId', () => {
  it('is the same for the same bytes, and another for other bytes', () => {
    expect(contentId(bytes('a tune'))).toBe(contentId(bytes('a tune')));
    expect(contentId(bytes('a tune'))).not.toBe(contentId(bytes('a tunf')));
    expect(contentId(bytes('ab'))).not.toBe(contentId(bytes('ba')));
    expect(contentId(bytes(''))).toMatch(/^0-[a-z0-9]+$/);
  });
});

describe('the library', () => {
  it('has an empty shelf and nothing open to begin with', () => {
    expect(library.pieces).toEqual([]);
    expect(library.current).toBeNull();
  });

  it('puts a file that opened on the shelf, under its content, with its title and the time', async () => {
    await library.openFile('my_tune.tune', bytes('a tune'));
    const id = contentId(bytes('a tune'));
    expect(library.pieces).toEqual([{ id, fileName: 'my_tune.tune', title: 'my tune', openedAt: 1000 }]);
    expect(library.current).toBe(id);
    expect(playback.score?.title).toBe('my tune');
    expect(shelf.files.has(id)).toBe(true);
  });

  it('puts a file on the shelf under a name given for it, when one is', async () => {
    await library.openFile('claviano-2026-10-11.tune', bytes('a take'), 'Played on 11 October');
    expect(library.pieces[0]).toMatchObject({ fileName: 'claviano-2026-10-11.tune', title: 'Played on 11 October' });
    // Opened again without a name, it keeps the one it has.
    await library.openFile('copy.tune', bytes('a take'));
    expect(library.pieces.map((kept) => kept.title)).toEqual(['Played on 11 October']);
  });

  it('keeps nothing of a file that did not open, and leaves open what was', async () => {
    await library.openFile('one.tune', bytes('one'));
    await library.openFile('bad.tune', bytes('broken'));
    await library.openFile('photo.jpg', bytes('not music'));
    expect(library.pieces.map((kept) => kept.fileName)).toEqual(['one.tune']);
    expect(library.current).toBe(contentId(bytes('one')));
  });

  it('has the last opened first', async () => {
    await library.openFile('one.tune', bytes('one'));
    time = 2000;
    await library.openFile('two.tune', bytes('two'));
    expect(library.pieces.map((kept) => kept.title)).toEqual(['two', 'one']);
    time = 3000;
    await library.open(contentId(bytes('one')));
    expect(library.pieces.map((kept) => [kept.title, kept.openedAt])).toEqual([
      ['one', 3000],
      ['two', 2000],
    ]);
  });

  it('takes the same file under another name for the same piece, and a changed file for a new one', async () => {
    await library.openFile('one.tune', bytes('one'));
    time = 2000;
    await library.openFile('copy of one.tune', bytes('one'));
    expect(library.pieces).toEqual([{ id: contentId(bytes('one')), fileName: 'one.tune', title: 'one', openedAt: 2000 }]);
    await library.openFile('one.tune', bytes('one, corrected'));
    expect(library.pieces).toHaveLength(2);
  });

  it('opens a piece from the shelf by its id, as the file it was', async () => {
    await library.openFile('one.tune', bytes('one'));
    await library.openFile('two.tune', bytes('two'));
    await library.open(contentId(bytes('one')));
    expect(playback.score?.title).toBe('one');
    expect(library.current).toBe(contentId(bytes('one')));
  });

  it('opens a demo by its id, and keeps it off the shelf', async () => {
    await library.open(demoPieceId(demo));
    expect(playback.score?.title).toBe('Ode');
    expect(library.current).toBe('demo.ode');
    expect(library.pieces).toEqual([]);
  });

  it('opens nothing for an id nobody knows', async () => {
    await library.openFile('one.tune', bytes('one'));
    await library.open('gone-123');
    expect(library.current).toBe(contentId(bytes('one')));
  });

  it('has no piece open once another is loaded past it', async () => {
    await library.openFile('one.tune', bytes('one'));
    playback.load(piece('Someone else'));
    expect(library.current).toBeNull();
  });

  it('reads the shelf when the app starts again, and opens from it', async () => {
    await library.openFile('one.tune', bytes('one'));
    await start();
    expect(library.pieces.map((kept) => kept.title)).toEqual(['one']);
    expect(library.current).toBeNull();
    await library.open(contentId(bytes('one')));
    expect(playback.score?.title).toBe('one');
  });

  it('opens a piece asked for before the shelf was read (a page loaded at a piece’s address)', async () => {
    await library.openFile('one.tune', bytes('one'));
    playback = new Playback(new FakeAudio(), new FakeTicker());
    library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, [demo]);
    const loading = library.load();
    await library.open(contentId(bytes('one')));
    await loading;
    expect(playback.score?.title).toBe('one');
  });

  it('drops a piece that arrives from the shelf after something else was asked for', async () => {
    await library.openFile('one.tune', bytes('one'));
    const slow = library.open(contentId(bytes('one')));
    await library.openFile('two.tune', bytes('two'));
    await slow;
    expect(playback.score?.title).toBe('two');
    expect(library.current).toBe(contentId(bytes('two')));
  });

  it('tells its listeners of the shelf changing and of another piece opening, until they leave', async () => {
    let changes = 0;
    const stop = library.onChange(() => changes++);
    await library.openFile('one.tune', bytes('one'));
    expect(changes).toBeGreaterThanOrEqual(2);
    stop();
    const told = changes;
    await library.openFile('two.tune', bytes('two'));
    expect(changes).toBe(told);
  });

  describe('what can be done with a piece', () => {
    const ONE = contentId(bytes('one'));
    beforeEach(() => library.openFile('one.tune', bytes('one')));

    it('gives it another name, kept on the shelf and through the same file opened again', async () => {
      await library.rename(ONE, '  Für Elise ');
      expect(library.pieces[0]?.title).toBe('Für Elise');
      expect(library.pieces[0]?.fileName).toBe('one.tune');
      await library.openFile('one.tune', bytes('one'));
      expect(library.pieces.map((kept) => kept.title)).toEqual(['Für Elise']);
      await start();
      expect(library.pieces[0]?.title).toBe('Für Elise');
    });

    it('keeps its name when given none, or one for a piece that is not there', async () => {
      await library.rename(ONE, '   ');
      await library.rename('gone-123', 'Someone');
      expect(library.pieces.map((kept) => kept.title)).toEqual(['one']);
    });

    it('gives its file out as it was given, under its own name', async () => {
      await library.rename(ONE, 'Für Elise');
      const file = await library.file(ONE);
      expect(file?.name).toBe('one.tune');
      expect(new TextDecoder().decode(file?.data)).toBe('one');
      expect(await library.file('gone-123')).toBeNull();
    });

    it('takes it off the shelf with its file and what was remembered of it', async () => {
      shelf.remembered.set(ONE, { position: 2 });
      await library.remove(ONE);
      expect(library.pieces).toEqual([]);
      expect([shelf.pieces.size, shelf.files.size, shelf.remembered.size]).toEqual([0, 0, 0]);
      // It was the open one: it plays on, as a piece of no shelf.
      expect(playback.score?.title).toBe('one');
      expect(library.current).toBeNull();
      await start();
      expect(library.pieces).toEqual([]);
    });

    it('leaves it on the shelf when the shelf fails to let go of it', async () => {
      shelf.broken = true;
      await library.remove(ONE);
      expect(library.pieces).toHaveLength(1);
    });
  });

  it('asks once that the shelf be kept for good, when the first piece of one’s own is on it', async () => {
    expect(shelf.protections).toBe(0);
    await library.open(demoPieceId(demo));
    expect(shelf.protections).toBe(0);
    await library.openFile('one.tune', bytes('one'));
    await library.openFile('two.tune', bytes('two'));
    await Promise.resolve();
    expect(shelf.protections).toBe(1);
  });

  it('knows whether the shelf keeps: yes while it reads and writes, no once it fails, yes again when it works', async () => {
    expect(library.keeps).toBe(true);
    shelf.broken = true;
    await library.openFile('one.tune', bytes('one'));
    expect(library.keeps).toBe(false);
    shelf.broken = false;
    await library.openFile('two.tune', bytes('two'));
    expect(library.keeps).toBe(true);
  });

  it('goes on without a shelf: pieces open, nothing is kept, nothing fails', async () => {
    shelf.broken = true;
    await start();
    expect(library.keeps).toBe(false);
    await library.openFile('one.tune', bytes('one'));
    expect(playback.score?.title).toBe('one');
    expect(library.current).toBe(contentId(bytes('one')));
    expect(library.pieces).toEqual([]);
    await expect(library.open('gone-123')).resolves.toBeUndefined();
  });
});
