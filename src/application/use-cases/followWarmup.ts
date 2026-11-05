import { exerciseScore } from '../../domain/exercises/score';
import type { WarmupStep } from '../../domain/exercises/warmup';
import type { OwnFinger } from '../../domain/fingering/own';
import { barNumber, type Score } from '../../domain/score';
import type { BarLoop } from './BarLoop';
import type { Bookmark, Bookmarks } from './Bookmarks';
import type { FreePlay } from './FreePlay';
import type { Library } from './Library';
import type { OpenScore } from './OpenScore';
import type { OwnFingering } from './OwnFingering';
import type { Learning, PieceWay, Way } from './PieceWay';
import type { Playback } from './Playback';
import { DEFAULT_PLAN, type TempoTrainer } from './TempoTrainer';
import type { WarmupSession } from './WarmupSession';

interface WarmupPlayer {
  readonly playback: Playback;
  readonly openScore: OpenScore;
  readonly library: Library;
  readonly barLoop: BarLoop;
  readonly trainer: TempoTrainer;
  readonly way: PieceWay;
  readonly bookmarks: Bookmarks;
  readonly fingering: OwnFingering;
  readonly freePlay: FreePlay;
}

interface KeptExercise {
  readonly position: number;
  readonly learning: Learning;
  readonly way: Way;
  readonly metronome: boolean;
  readonly countIn: boolean;
  readonly pedal: boolean;
  readonly bookmarks: readonly Bookmark[];
  readonly fingers: readonly OwnFinger[];
}

/** Opens the queue in the ordinary player, keeping only its current task for this visit. */
export function followWarmup(session: WarmupSession, { playback, openScore, library, barLoop, trainer, way, bookmarks, fingering, freePlay }: WarmupPlayer): () => void {
  let shown: Score | null = null;
  let steps: readonly WarmupStep[] | null = null;
  let index: number | null = null;
  let kept: KeptExercise | null = null;
  // Loading and restoring notify other use cases synchronously; none of those changes is a departure.
  let setting = false;

  const capture = (): KeptExercise => ({
    position: playback.position,
    learning: way.learning ?? {
      tempo: playback.tempo,
      loop: { on: barLoop.enabled, from: barLoop.from, to: barLoop.to },
      hands: { right: playback.isHandEnabled('right'), left: playback.isHandEnabled('left') },
      trainer: { on: trainer.enabled, plan: { ...trainer.plan } },
    },
    way: way.way,
    metronome: playback.metronomeEnabled,
    countIn: playback.countInEnabled,
    pedal: playback.pedalEnabled,
    bookmarks: [...bookmarks.all],
    fingers: [...fingering.all],
  });

  const apply = (score: Score, saved: KeptExercise | null): void => {
    way.set('learn');
    trainer.setEnabled(false);
    playback.setPassAtATime(false);
    barLoop.setEnabled(false);
    const learning = saved?.learning;
    barLoop.setFrom(learning?.loop.from ?? barNumber(score, 0));
    barLoop.setTo(learning?.loop.to ?? barNumber(score, score.bars.length - 1));
    barLoop.setEnabled(learning?.loop.on ?? false);
    playback.setTempo(learning?.tempo ?? 1);
    playback.setHandEnabled('right', learning?.hands.right ?? true);
    playback.setHandEnabled('left', learning?.hands.left ?? true);
    trainer.restore(learning?.trainer ?? { on: false, plan: DEFAULT_PLAN });
    bookmarks.set(saved?.bookmarks ?? []);
    fingering.set(saved?.fingers ?? []);
    if (saved) {
      playback.setMetronomeEnabled(saved.metronome);
      playback.setCountInEnabled(saved.countIn);
      playback.setPedalEnabled(saved.pedal);
    }
    // Listening keeps the restored learning settings aside, as it does for a library piece.
    way.set(saved?.way ?? 'learn');
    playback.seek(saved?.position ?? 0);
  };

  const follow = (): void => {
    if (setting) return;
    setting = true;
    try {
      if (session.status === 'active' && session.step) {
        const sameTask = steps === session.steps && index === session.current;
        const saved = sameTask ? kept : null;
        // A fresh score tells all score-bound use cases to reset, including on a direct resume.
        const score = exerciseScore(session.step.exerciseId, session.step.hands);
        library.cancelPending();
        if (freePlay.entered) freePlay.leave();
        openScore.openGenerated(score);
        shown = score;
        steps = session.steps;
        index = session.current;
        kept = saved;
        // The load and all of its listeners have completed before the task's settings are applied.
        apply(score, saved);
      } else if (shown && playback.score === shown) {
        if (session.status === 'away') kept = capture();
        playback.pause();
      }
    } finally {
      setting = false;
    }
  };

  const stops = [
    session.onChange(follow),
    playback.onBeforeLoad(() => {
      if (!setting && shown && playback.score === shown) session.leave();
    }),
    freePlay.onChange(() => {
      if (freePlay.entered) session.leave();
    }),
  ];
  // Also works when wiring is attached to a session that was already started.
  if (session.status === 'active') follow();
  return () => stops.forEach(stop => stop());
}
