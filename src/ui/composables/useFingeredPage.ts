import { computed, type ComputedRef, type Ref } from 'vue';
import { withFingerHints } from '../../domain/fingering/hints';
import { withOwnFingers } from '../../domain/fingering/own';
import type { Score } from '../../domain/score';
import { useDeps } from '../deps';
import { useMirror } from './useMirror';
import { usePlaybackState } from './usePlaybackState';

/**
 * The open piece as it is shown: where `shown` (fingering is to be shown), with one's own fingers
 * written in and the hints fitted round them; otherwise as the notes give it. (The staff and the
 * falling notes are given this: what is shown is decided here, not by what draws it.)
 */
export function useFingeredPage(shown: Readonly<Ref<boolean>>): ComputedRef<Score | null> {
  const { playback, fingering } = useDeps();
  const state = usePlaybackState(playback);
  const own = useMirror(fingering, () => fingering.all);
  return computed(() => {
    const score = state.value.score;
    if (!score || !shown.value) return score;
    return withFingerHints(withOwnFingers(score, own.value));
  });
}
