import type { PracticePlan } from '../../application/use-cases/PracticePlan';
import type { Playback } from '../../application/use-cases/Playback';
import type { Hand } from '../../domain/note';

/**
 * Whether the views draw a hand's notes lit, or dimmed. In a step of the plan, the hands the step
 * is played with: those are what one reads, heard or not (a step does not let them be heard: one
 * plays them oneself). Out of it, the hands heard. Asked at every frame.
 */
export const litHands =
  (plan: PracticePlan, playback: Playback) =>
  (hand: Hand): boolean => {
    const step = plan.current === null ? undefined : plan.steps[plan.current];
    return step ? step.hands === 'both' || step.hands === hand : playback.isHandEnabled(hand);
  };
