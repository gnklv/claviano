import { computed, type ComputedRef } from 'vue';
import type { Library } from '../../application/use-cases/Library';
import type { OpenFailure, OpenScore } from '../../application/use-cases/OpenScore';
import type { Playback } from '../../application/use-cases/Playback';
import type { Demo } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import { useLibrary } from './useLibrary';
import { useOpenScore } from './useOpenScore';
import { usePlaybackState } from './usePlaybackState';

const ERROR_MESSAGES: Record<OpenFailure['reason'], MessageKey> = {
  'unsupported-format': 'errorUnsupportedFormat',
  'invalid-file': 'errorInvalidFile',
  'unsupported-feature': 'errorUnsupportedFeature',
  unknown: 'errorUnknown',
};

/**
 * What to say about the piece: its title, and what failed to open last, if anything did. Kept as
 * data until here, so the text follows a language switch.
 */
export function usePieceText(
  playback: Playback,
  openScore: OpenScore,
  library: Library,
  demos: readonly Demo[],
): { title: ComputedRef<string>; error: ComputedRef<string | null> } {
  const { t } = useI18n();
  const state = usePlaybackState(playback);
  const opened = useOpenScore(openScore);
  const shelf = useLibrary(library);
  const demoTitle = (id: string): string => t(demos.find((demo) => demo.id === id)?.title ?? 'errorUnknown');

  const error = computed(() => {
    const { failure } = opened.value;
    if (!failure) return null;
    const file = 'file' in failure.source ? failure.source.file : demoTitle(failure.source.demo.id);
    return t('openError', { file, reason: t(ERROR_MESSAGES[failure.reason]) });
  });

  const title = computed(() => {
    const score = state.value.score;
    if (!score) return '';
    const { demo } = opened.value;
    if (demo) return demoTitle(demo.id);
    // The name it has on the shelf (it may have been given another one there), else the file's own.
    const { pieces, current } = shelf.value;
    return pieces.find((piece) => piece.id === current)?.title ?? score.title;
  });

  return { title, error };
}
