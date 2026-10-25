import type { Playback } from '../../application/use-cases/Playback';
import type { PlanStep } from '../../domain/practice/plan';
import { writtenBarNumber } from '../../domain/score';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/useI18n';
import { usePlaybackState } from './usePlaybackState';

const HANDS: Record<PlanStep['hands'], MessageKey> = { right: 'rightHand', left: 'leftHand', both: 'stepBoth' };

/** A share of the piece's tempo, as it is read on the tempo's button. */
const percent = (tempo: number): number => Math.round(tempo * 100);

/**
 * What a step of the plan is called: its bars as printed, and what is played in them (a hand, a
 * hand to the other, both, up to tempo, joined, the whole) at what tempo. Kept as data until here,
 * so the words follow a language switch.
 */
export function useStepWords(playback: Playback) {
  const { t } = useI18n();
  const state = usePlaybackState(playback);
  const bars = (step: PlanStep): string => {
    const score = state.value.score;
    if (!score) return '';
    const from = writtenBarNumber(score, step.from);
    const to = writtenBarNumber(score, step.to);
    return from === to ? t('stepBar', { bar: from }) : t('stepBars', { from, to });
  };
  const what = (step: PlanStep): string => {
    switch (step.kind) {
      case 'with':
        return `${t(step.hands === 'left' ? 'stepLeftToRight' : 'stepRightToLeft')} · ${percent(step.tempo)}%`;
      case 'up':
        return `${t('stepUp')} · ${percent(step.tempo)}–${percent(step.aim ?? step.tempo)}%`;
      case 'join':
        return `${t('stepJoin')} · ${percent(step.tempo)}%`;
      case 'whole':
        return `${t('stepWhole')} · ${percent(step.tempo)}%`;
      default:
        return `${t(HANDS[step.hands])} · ${percent(step.tempo)}%`;
    }
  };
  return { bars, what, whole: (step: PlanStep): string => `${bars(step)} · ${what(step)}` };
}
