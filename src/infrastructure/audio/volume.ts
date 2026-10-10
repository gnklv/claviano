/**
 * The gain for a volume from 0 to 1. The ear hears loudness by ratios, so the gain goes by the
 * square: the slider's half way sounds about half as loud, not nearly as loud as the top.
 */
export const volumeGain = (volume: number): number => Math.min(1, Math.max(0, volume)) ** 2;
