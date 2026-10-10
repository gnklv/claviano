import { computed, type ComputedRef } from 'vue';
import type { OpenFailure, OpenScore } from '../../application/use-cases/OpenScore';
import type { Playback } from '../../application/use-cases/Playback';
import { barNumber } from '../../domain/score';
import type { Demo } from '../deps';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import { useOpenScore } from './useOpenScore';
import { usePlaybackState } from './usePlaybackState';

const ERROR_MESSAGES: Record<OpenFailure['reason'], MessageKey> = {
  'unsupported-format': 'errorUnsupportedFormat',
  'invalid-file': 'errorInvalidFile',
  'unsupported-feature': 'errorUnsupportedFeature',
  unknown: 'errorUnknown',
};

/**
 * What to say about the piece: its title with the bars and notes it has, and what failed to open
 * last, if anything did. Kept as data until here, so the text follows a language switch.
 */
export function usePieceText(playback: Playback, openScore: OpenScore, demos: readonly Demo[]): { summary: ComputedRef<string>; error: ComputedRef<string | null> } {
  const { t } = useI18n();
  const state = usePlaybackState(playback);
  const opened = useOpenScore(openScore);
  const demoTitle = (id: string): string => t(demos.find((demo) => demo.id === id)?.title ?? 'errorUnknown');

  const error = computed(() => {
    const { failure } = opened.value;
    if (!failure) return null;
    const file = 'file' in failure.source ? failure.source.file : demoTitle(failure.source.demo.id);
    return t('openError', { file, reason: t(ERROR_MESSAGES[failure.reason]) });
  });

  const summary = computed(() => {
    const score = state.value.score;
    if (!score) return '';
    const { demo } = opened.value;
    return t('scoreSummary', {
      title: demo ? demoTitle(demo.id) : score.title,
      // A pickup is not counted as a bar of its own: the count is the last bar's number.
      bars: t('barsCount', { count: barNumber(score, score.bars.length - 1) }),
      notes: t('notesCount', { count: score.notes.length }),
    });
  });

  return { summary, error };
}
