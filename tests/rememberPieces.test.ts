import { beforeEach, describe, expect, it } from 'vitest';
import type { ScoreParser } from '../src/application/ports/ScoreParser';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { Library } from '../src/application/use-cases/Library';
import { PieceMemories } from '../src/application/use-cases/PieceMemories';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { OpenScore } from '../src/application/use-cases/OpenScore';
import { Playback } from '../src/application/use-cases/Playback';
import { rememberPieces } from '../src/application/use-cases/rememberPieces';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { Bookmarks } from '../src/application/use-cases/Bookmarks';
import { OwnFingering } from '../src/application/use-cases/OwnFingering';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { contentId } from '../src/domain/contentId';
import { transcribed } from '../src/domain/notation/transcription';
import { createScore, type Score } from '../src/domain/score';
import { FakeAudio, FakePieceShelf, FakeTicker } from './fakes';

/* How a piece is left and come back to: eight bars of one second each, one note in each, written down. */

const piece = (title: string): Score =>
  transcribed(
    createScore(
      title,
      Array.from({ length: 8 }, (_, bar) => ({ pitch: 60 + bar, start: bar, duration: 1, beat: bar * 4, beats: 4, velocity: 0.8, hand: 'right' as const })),
      Array.from({ length: 8 }, (_, bar) => bar),
    ),
  );
const tunes: ScoreParser = { canParse: (fileName) => fileName.endsWith('.tune'), parse: (_, title) => piece(title) };
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
const ONE = contentId(bytes('one'));
const TWO = contentId(bytes('two'));

let shelf: FakePieceShelf;
let playback: Playback;
let barLoop: BarLoop;
let library: Library;
let memories: PieceMemories;
let trainer: TempoTrainer;
let bookmarks: Bookmarks;
let fingering: OwnFingering;
let way: PieceWay;
let plan: PracticePlan;
/** Practice made anew on the playback and the loop there are now (for a page loaded again). */
const practice = () => {
  const trainer = new TempoTrainer(playback);
  return { trainer, bookmarks: new Bookmarks(playback, barLoop), fingering: new OwnFingering(playback), way: new PieceWay(playback, barLoop, trainer), plan: new PracticePlan(playback) };
};
let writeDown: () => void;
/** The app starts (again): with the shelf as it was left. */
const start = async () => {
  playback = new Playback(new FakeAudio(), new FakeTicker());
  barLoop = new BarLoop(playback);
  library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, [{ id: 'demo', load: () => piece('Demo') }]);
  memories = new PieceMemories(shelf);
  trainer = new TempoTrainer(playback);
  bookmarks = new Bookmarks(playback, barLoop);
  fingering = new OwnFingering(playback);
  way = new PieceWay(playback, barLoop, trainer);
  plan = new PracticePlan(playback);
  writeDown = rememberPieces(library, memories, { playback, barLoop, trainer, bookmarks, fingering, way, plan });
  await Promise.all([library.load(), memories.load()]);
};

beforeEach(async () => {
  shelf = new FakePieceShelf();
  await start();
});

describe('remembering pieces', () => {
  it('starts a piece opened for the first time plain: from the beginning, at full tempo, both hands, no loop', async () => {
    await library.openFile('one.tune', bytes('one'));
    playback.setTempo(0.6);
    playback.setHandEnabled('left', false);
    barLoop.select(2, 3, 2);
    await library.openFile('two.tune', bytes('two'));
    expect(playback.tempo).toBe(1);
    expect(playback.isHandEnabled('left')).toBe(true);
    expect(playback.position).toBe(0);
    expect(barLoop.enabled).toBe(false);
  });

  it('listens to a piece opened for the first time, and comes back to it learnt as it was left', async () => {
    await library.openFile('one.tune', bytes('one'));
    expect(way.way).toBe('listen');
    way.set('learn');
    await library.openFile('two.tune', bytes('two'));
    expect(way.way).toBe('listen');
    await library.open(ONE);
    expect(way.way).toBe('learn');
  });

  it('listens to a piece kept from before there were two ways, with what learning had set kept aside', async () => {
    shelf.remembered.set(ONE, { position: 0, tempo: 0.8, hands: { right: true, left: true }, loop: { on: false, from: 0, to: 0 }, bar: 1, bars: 8 });
    await start();
    await library.openFile('one.tune', bytes('one'));
    expect([way.way, playback.tempo]).toEqual(['listen', 1]);
    way.set('learn');
    expect(playback.tempo).toBe(0.8);
  });

  it('keeps with a piece its place, tempo, hands and loop, and the bar it was left at', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.7);
    playback.setHandEnabled('right', false);
    barLoop.select(3, 5, 2);
    playback.seek(3.5);
    expect(memories.memory(ONE)).toEqual({
      position: 3.5,
      tempo: 0.7,
      hands: { right: false, left: true },
      loop: { on: true, from: 3, to: 5 },
      trainer: { on: false, from: 0.6, to: 1, step: 0.02, every: 1, back: false },
      bookmarks: [],
      fingers: [],
      plan: { done: [] },
      way: 'learn',
      bar: 4,
      bars: 8,
    });
  });

  it('comes back to a piece as it was left, after another piece and after the app is started again', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.7);
    playback.setHandEnabled('right', false);
    barLoop.select(3, 5, 2);
    playback.seek(3.5);
    await library.openFile('two.tune', bytes('two'));
    playback.seek(6);

    for (const restart of [false, true]) {
      if (restart) await start();
      await library.open(ONE);
      expect(playback.tempo).toBe(0.7);
      expect(playback.isHandEnabled('right')).toBe(false);
      expect(playback.position).toBe(3.5);
      expect([barLoop.enabled, barLoop.from, barLoop.to]).toEqual([true, 3, 5]);
      expect(playback.loop).toEqual({ start: 2, end: 5 });
      await library.open(TWO);
      expect(playback.tempo).toBe(1);
      expect(playback.position).toBe(6);
      expect(barLoop.enabled).toBe(false);
    }
  });

  it('comes back to a piece with its trainer as it was left, at the tempo the training had got to', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    trainer.setPlan({ from: 0.7, step: 0.05, every: 2, back: true });
    trainer.setEnabled(true);
    playback.setTempo(0.8);
    await library.openFile('two.tune', bytes('two'));
    expect(trainer.enabled).toBe(false);
    expect(playback.tempo).toBe(1);

    await start();
    await library.open(ONE);
    expect(trainer.enabled).toBe(true);
    expect(trainer.plan).toEqual({ from: 0.7, to: 1, step: 0.05, every: 2, back: true });
    expect(playback.tempo).toBe(0.8);
  });

  it('comes back to a piece with its bookmarks, and opens another without them', async () => {
    await library.openFile('one.tune', bytes('one'));
    bookmarks.add('The hard bars', 5);
    await library.openFile('two.tune', bytes('two'));
    expect(bookmarks.all).toEqual([]);
    await start();
    await library.open(ONE);
    expect(bookmarks.all).toEqual([{ name: 'The hard bars', bar: 5 }]);
  });

  it('comes back to a piece with its own fingering', async () => {
    await library.openFile('one.tune', bytes('one'));
    fingering.setFinger({ beat: 4, pitch: 61, hand: 'right' }, 2);
    await library.openFile('two.tune', bytes('two'));
    expect(fingering.all).toEqual([]);
    await start();
    await library.open(ONE);
    expect(fingering.all).toEqual([{ beat: 4, pitch: 61, finger: 2 }]);
  });

  it('keeps a piece listened to as learning had set it, and comes back to it listened to', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.7);
    barLoop.select(3, 5, 2);
    playback.setHandEnabled('left', false);
    way.set('listen');
    expect([playback.tempo, barLoop.enabled, playback.isHandEnabled('left')]).toEqual([1, false, true]);
    expect(memories.memory(ONE)).toMatchObject({ way: 'listen', tempo: 0.7, loop: { on: true, from: 3, to: 5 }, hands: { right: true, left: false } });

    await start();
    await library.open(ONE);
    expect(way.way).toBe('listen');
    expect([playback.tempo, barLoop.enabled]).toEqual([1, false]);
    way.set('learn');
    expect([playback.tempo, barLoop.enabled, barLoop.from, barLoop.to, playback.isHandEnabled('left')]).toEqual([0.7, true, 3, 5, false]);
  });

  it('comes back to a piece with the steps of its plan done, and opens another with none', async () => {
    await library.openFile('one.tune', bytes('one'));
    plan.set([0, 1]);
    expect(memories.memory(ONE)).toMatchObject({ plan: { done: [0, 1] } });
    await library.openFile('two.tune', bytes('two'));
    expect(plan.doneSteps).toEqual([]);
    await start();
    await library.open(ONE);
    expect(plan.doneSteps).toEqual([0, 1]);
  });

  it('keeps a piece left in a step of its plan with both hands heard, as out of the plan', async () => {
    await library.openFile('one.tune', bytes('one'));
    plan.start(0);
    playback.setHandEnabled('right', false);
    playback.setHandEnabled('left', false);
    expect(memories.memory(ONE)?.hands).toEqual({ right: true, left: true });
  });

  it('lets go of fingers at notes the piece no longer has, and of fingers that are not such', async () => {
    const kept = { position: 0, tempo: 1, hands: { right: true, left: true }, loop: { on: false, from: 0, to: 0 }, way: 'learn', bar: 1, bars: 8 };
    shelf.remembered.set(ONE, { ...kept, fingers: [{ beat: 4, pitch: 61, finger: 2 }, { beat: 4, pitch: 99, finger: 3 }] });
    shelf.remembered.set(TWO, { ...kept, tempo: 0.8, fingers: [{ beat: 4, pitch: 61, finger: 6 }] });
    await start();
    await library.openFile('one.tune', bytes('one'));
    expect(fingering.all).toEqual([{ beat: 4, pitch: 61, finger: 2 }]);
    writeDown();
    expect(memories.memory(ONE)?.fingers).toEqual([{ beat: 4, pitch: 61, finger: 2 }]);
    await library.openFile('two.tune', bytes('two'));
    expect(playback.tempo).toBe(0.8);
    expect(fingering.all).toEqual([]);
  });

  it('remembers demos as it does files', async () => {
    await library.open('demo.demo');
    way.set('learn');
    playback.setTempo(0.5);
    playback.seek(4);
    await start();
    await library.open('demo.demo');
    expect(playback.tempo).toBe(0.5);
    expect(playback.position).toBe(4);
  });

  it('writes down the place the music has reached when told to (the page is going)', async () => {
    const audio = new FakeAudio();
    playback = new Playback(audio, new FakeTicker());
    barLoop = new BarLoop(playback);
    library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, []);
    writeDown = rememberPieces(library, memories, { playback, barLoop, ...practice() });
    await library.openFile('one.tune', bytes('one'));
    await playback.play();
    audio.time += 2.5;
    expect(memories.memory(ONE)?.position).toBe(0);
    writeDown();
    expect(memories.memory(ONE)?.position).toBeCloseTo(2.5);
    expect(memories.memory(ONE)?.bar).toBe(3);
  });

  it('writes down the place when the music is stopped by another piece opening', async () => {
    const audio = new FakeAudio();
    playback = new Playback(audio, new FakeTicker());
    barLoop = new BarLoop(playback);
    library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, []);
    rememberPieces(library, memories, { playback, barLoop, ...practice() });
    await library.openFile('one.tune', bytes('one'));
    await playback.play();
    audio.time += 2.5;
    await library.openFile('two.tune', bytes('two'));
    expect(memories.memory(ONE)?.position).toBeCloseTo(2.5);
    expect(memories.memory(TWO)?.position).toBe(0);
  });

  it('starts a piece left at its very end from the beginning', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.8);
    playback.seek(7.9);
    await library.openFile('two.tune', bytes('two'));
    await library.open(ONE);
    expect(playback.position).toBe(0);
    expect(playback.tempo).toBe(0.8);
  });

  it('lets go of what is remembered of a piece taken off the shelf', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.7);
    expect(memories.memory(ONE)?.tempo).toBe(0.7);
    await library.remove(ONE);
    expect(memories.memory(ONE)).toBeNull();
    expect(shelf.remembered.size).toBe(0);
  });

  it('sets a piece as it was left even when it opens before what was kept has been read', async () => {
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.7);
    playback.seek(3);
    // Again, with the shelf read in the other order: the piece first, its memory after.
    playback = new Playback(new FakeAudio(), new FakeTicker());
    barLoop = new BarLoop(playback);
    library = new Library(shelf, new OpenScore(playback, new LoadScore([tunes])), playback, []);
    memories = new PieceMemories(shelf);
    rememberPieces(library, memories, { playback, barLoop, ...practice() });
    await library.load();
    await library.open(ONE);
    expect(playback.tempo).toBe(1);
    await memories.load();
    expect(playback.tempo).toBe(0.7);
    expect(playback.position).toBe(3);
  });

  it('takes no memory from what is not one (an older version’s, a stranger’s)', async () => {
    shelf.remembered.set(ONE, { position: 'far', tempo: 2 });
    shelf.remembered.set(TWO, null);
    await start();
    expect(memories.memory(ONE)).toBeNull();
    await library.openFile('one.tune', bytes('one'));
    expect(playback.tempo).toBe(1);
    expect(playback.position).toBe(0);
  });

  it('remembers for the visit where nothing can be stored', async () => {
    shelf.broken = true;
    await start();
    await library.openFile('one.tune', bytes('one'));
    way.set('learn');
    playback.setTempo(0.6);
    await library.openFile('two.tune', bytes('two'));
    await library.open(ONE);
    // (Nothing is on the shelf to open it from: it stays as it was.)
    expect(library.current).toBe(TWO);
    expect(memories.memory(ONE)?.tempo).toBe(0.6);
  });
});
