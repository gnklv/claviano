import { describe, expect, it, vi } from 'vitest';
import { WarmupSession } from '../src/application/use-cases/WarmupSession';
import { followWarmup } from '../src/application/use-cases/followWarmup';
import { Playback } from '../src/application/use-cases/Playback';
import { OpenScore } from '../src/application/use-cases/OpenScore';
import { LoadScore } from '../src/application/use-cases/LoadScore';
import { Library } from '../src/application/use-cases/Library';
import { BarLoop } from '../src/application/use-cases/BarLoop';
import { TempoTrainer } from '../src/application/use-cases/TempoTrainer';
import { PieceWay } from '../src/application/use-cases/PieceWay';
import { Bookmarks } from '../src/application/use-cases/Bookmarks';
import { OwnFingering } from '../src/application/use-cases/OwnFingering';
import { FreePlay } from '../src/application/use-cases/FreePlay';
import { PracticePlan } from '../src/application/use-cases/PracticePlan';
import { PieceMemories } from '../src/application/use-cases/PieceMemories';
import { followPlan } from '../src/application/use-cases/followPlan';
import { rememberPieces } from '../src/application/use-cases/rememberPieces';
import type { Score } from '../src/domain/score';
import { odeToJoy } from '../src/demo/odeToJoy';
import { FakeAudio, FakeTicker, FakePieceShelf } from './fakes';

const piece = () => odeToJoy('Library piece');

async function practising() {
  const audio = new FakeAudio();
  const playback = new Playback(audio, new FakeTicker());
  const openScore = new OpenScore(playback, new LoadScore([]));
  const shelf = new FakePieceShelf();
  const demos = [{ id: 'piece', load: piece }];
  const library = new Library(shelf, openScore, playback, demos);
  const memories = new PieceMemories(shelf);
  await library.load();
  await memories.load();
  const barLoop = new BarLoop(playback);
  const trainer = new TempoTrainer(playback);
  const way = new PieceWay(playback, barLoop, trainer);
  const bookmarks = new Bookmarks(playback, barLoop);
  const fingering = new OwnFingering(playback);
  const freePlay = new FreePlay(audio);
  const plan = new PracticePlan(playback, (score: Score) => !openScore.isGenerated(score));
  followPlan(plan, { playback, barLoop, trainer, way });
  const remember = rememberPieces(library, memories, { playback, barLoop, trainer, way, bookmarks, fingering, plan });
  const session = new WarmupSession();
  const dispose = followWarmup(session, { playback, openScore, library, barLoop, trainer, way, bookmarks, fingering, freePlay });
  return { audio, playback, openScore, shelf, library, memories, barLoop, trainer, way, bookmarks, fingering, freePlay, plan, remember, session, dispose };
}

describe('a warmup in the ordinary player', () => {
  it('opens each task paused with plain learning settings and no shelf entry', async () => {
    const h = await practising();
    h.playback.setTempo(0.6);
    h.playback.setHandEnabled('left', false);
    h.playback.setPassAtATime(true);
    h.session.start('beginner', 5);
    expect(h.playback.score).not.toBeNull();
    expect(h.openScore.isGenerated(h.playback.score!)).toBe(true);
    expect([h.playback.playing, h.playback.position, h.playback.tempo]).toEqual([false, 0, 1]);
    expect([h.playback.isHandEnabled('left'), h.playback.isHandEnabled('right')]).toEqual([true, true]);
    expect([h.barLoop.enabled, h.trainer.enabled, h.playback.passAtATime, h.way.way]).toEqual([false, false, false, 'learn']);
    expect(h.plan.steps).toHaveLength(0);
    expect(h.library.current).toBeNull();
    expect(h.shelf.pieces.size).toBe(0);
  });

  it('next stops playback and opens a fresh score at the beginning', async () => {
    const h = await practising();
    h.session.start('beginner', 5);
    const first = h.playback.score;
    await h.playback.play();
    h.session.next();
    expect(h.session.current).toBe(1);
    expect(h.playback.score).not.toBe(first);
    expect([h.playback.playing, h.playback.position]).toEqual([false, 0]);
  });

  it('next invalidates an audio resume still waiting to resolve', async () => {
    const h = await practising();
    let release!: () => void;
    h.audio.resume = () => new Promise<void>(resolve => { release = resolve; });
    h.session.start('beginner', 5);
    const playing = h.playback.play();
    h.session.next();
    release();
    await playing;
    expect(h.playback.playing).toBe(false);
    expect(h.audio.played).toHaveLength(0);
  });

  it('keeps the task and its settings in memory when another score opens', async () => {
    const h = await practising();
    h.session.start('beginner', 5);
    const first = h.playback.score;
    h.playback.setTempo(0.72);
    h.playback.setHandEnabled('left', false);
    h.playback.setMetronomeEnabled(true);
    h.playback.setCountInEnabled(true);
    h.playback.setPedalEnabled(false);
    h.barLoop.select(1, 1, 0);
    h.trainer.setPlan({ from: 0.65, to: 0.85, back: true });
    h.trainer.setEnabled(true);
    h.playback.setTempo(0.72);
    h.playback.seek(0.5);
    h.bookmarks.add('First group', 1);
    h.fingering.set([{ beat: 0, pitch: first!.notation.notes[0].sounding, finger: 2 }]);
    h.way.set('listen');
    await h.openScore.openDemo({ id: 'other', load: piece });
    expect(h.session.status).toBe('away');
    h.session.resume();
    expect(h.session.status).toBe('active');
    expect(h.playback.score).not.toBe(first);
    expect(h.playback.playing).toBe(false);
    expect(h.playback.position).toBeCloseTo(0.5);
    expect(h.way.way).toBe('listen');
    expect([h.playback.metronomeEnabled, h.playback.countInEnabled, h.playback.pedalEnabled]).toEqual([true, true, false]);
    expect(h.bookmarks.all.map(mark => mark.name)).toEqual(['First group']);
    expect(h.fingering.all[0]?.finger).toBe(2);
    h.way.set('learn');
    expect(h.playback.tempo).toBeCloseTo(0.72);
    expect(h.playback.isHandEnabled('left')).toBe(false);
    expect([h.barLoop.enabled, h.barLoop.from, h.barLoop.to, h.trainer.enabled, h.trainer.plan.back]).toEqual([true, 1, 1, true, true]);
  });

  it('leaving pauses; free play also leaves; a finished task restarts from scratch', async () => {
    const h = await practising();
    h.session.startExercise('five-notes', 'right');
    await h.playback.play();
    h.freePlay.enter();
    expect([h.session.status, h.playback.playing]).toEqual(['away', false]);
    h.session.next();
    expect(h.session.current).toBe(0);
    h.session.resume();
    h.session.next();
    expect(h.session.status).toBe('active');
    h.session.finish();
    expect([h.session.status, h.playback.playing]).toEqual(['finished', false]);
    h.session.restart();
    expect([h.session.status, h.session.current, h.playback.position, h.playback.playing]).toEqual(['active', 0, 0, false]);
  });

  it('a failed piece opening leaves the warmup active and its score intact', async () => {
    const h = await practising();
    h.session.start('beginner', 5);
    const score = h.playback.score;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await h.openScore.openDemo({ id: 'broken', load: () => { throw new Error('not available'); } });
    } finally {
      error.mockRestore();
    }
    expect(h.openScore.failure).not.toBeNull();
    expect(h.session.status).toBe('active');
    expect(h.playback.score).toBe(score);
  });

  it('keeps library Continue and its active practice plan separate from the warmup', async () => {
    const h = await practising();
    await h.library.open('demo.piece');
    h.way.set('learn');
    h.plan.start(0);
    expect(h.plan.current).toBe(0);
    h.playback.setTempo(0.77);
    h.playback.seek(1.2);
    h.session.start('beginner', 5);
    expect(h.plan.current).toBeNull();
    expect(h.plan.steps).toHaveLength(0);
    h.remember();
    const memory = h.memories.memory('demo.piece');
    expect(memory?.tempo).toBeCloseTo(0.77);
    expect(memory?.position).toBeCloseTo(1.2);
    await h.library.open('demo.piece');
    expect(h.session.status).toBe('away');
    expect(h.playback.score?.title).toBe('Library piece');
    expect(h.playback.tempo).toBeCloseTo(0.77);
    expect(h.plan.current).toBe(0);
    expect(h.plan.steps.length).toBeGreaterThan(0);
  });

  it('finishing an away session does not pause the piece now being played', async () => {
    const h = await practising();
    h.session.start('beginner', 5);
    await h.openScore.openDemo({ id: 'other', load: piece });
    await h.playback.play();
    expect(h.session.status).toBe('away');
    h.session.finish();
    expect(h.session.status).toBe('finished');
    expect(h.playback.playing).toBe(true);
  });

  it('cancels a pending demo when starting and drops glue listeners on disposal', async () => {
    const h = await practising();
    let resolve!: (score: ReturnType<typeof piece>) => void;
    const pending = h.openScore.openDemo({ id: 'late', load: () => new Promise(done => { resolve = done; }) });
    h.session.start('beginner', 5);
    const generated = h.playback.score;
    resolve(piece());
    await pending;
    expect(h.playback.score).toBe(generated);
    h.dispose();
    h.session.next();
    expect(h.playback.score).toBe(generated);
    expect(new WarmupSession().status).toBe('idle');
  });
});
