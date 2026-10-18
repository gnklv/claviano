/**
 * Two moments of the music (in beats, in seconds, or along the page in bars) closer than this are
 * one. What arithmetic leaves behind of thirds and dotted notes is far smaller; no two notes of a
 * piece lie nearer.
 */
export const SAME_MOMENT = 1e-6;

/** Whether two moments of the music are one (see SAME_MOMENT). */
export const sameMoment = (a: number, b: number): boolean => Math.abs(a - b) < SAME_MOMENT;
