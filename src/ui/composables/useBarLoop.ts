import { effectScope, ref, watch, type Ref } from 'vue';
import type { Playback } from '../../application/use-cases/Playback';
import { barIndexNear, barRange, type Score } from '../../domain/score';

export interface BarLoop {
  readonly enabled: Ref<boolean>;
  /** Printed bar numbers, as in the loop fields. */
  readonly from: Readonly<Ref<number>>;
  readonly to: Readonly<Ref<number>>;
  /** The loop fields, typed in by hand: passes are then taken near where playback is. */
  setFrom(bar: number): void;
  setTo(bar: number): void;
  /** Loops printed bars `from..to`, taking the passes (with repeats) nearest to `near` seconds. */
  select(from: number, to: number, near: number): void;
  /** Moves playback to `time`; a jump out of the loop switches the loop off. */
  jumpTo(time: number): void;
}

let shared: BarLoop | null = null;

/**
 * The bar loop, shared by the transport's loop controls and the staff (drag to select bars).
 * With repeats a printed bar is played more than once; the loop takes the passes nearest to
 * where the choice was made, so looping inside the second pass stays in the second pass.
 */
export function useBarLoop(playback: Playback): BarLoop {
  if (shared) return shared;
  // Lives as long as the app, not as long as the first component that asked for it.
  shared = effectScope(true).run(() => {
    const enabled = ref(false);
    const from = ref(1);
    const to = ref(4);
    /** Where the passes were chosen, in seconds; null: near where playback is. */
    let near: number | null = null;

    const apply = () => {
      const score = playback.score;
      if (!score) return;
      const around = near ?? playback.position;
      playback.setLoop(
        enabled.value ? barRange(score, barIndexNear(score, from.value, around), barIndexNear(score, to.value, around)) : null,
      );
    };
    watch([enabled, from, to], apply);

    // A new score starts without a loop.
    let score: Score | null = playback.score;
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      enabled.value = false;
      near = null;
    });

    return {
      enabled,
      from,
      to,
      setFrom(bar: number) {
        near = null;
        from.value = bar;
      },
      setTo(bar: number) {
        near = null;
        to.value = bar;
      },
      select(fromBar: number, toBar: number, around: number) {
        near = around;
        from.value = Math.min(fromBar, toBar);
        to.value = Math.max(fromBar, toBar);
        enabled.value = true;
        apply(); // right away, not on the next tick: a seek right after must see the new loop
      },
      jumpTo(time: number) {
        const loop = playback.loop;
        if (loop && (time < loop.start || time >= loop.end)) {
          enabled.value = false;
          playback.setLoop(null);
        }
        playback.seek(time);
      },
    };
  })!;
  return shared;
}
