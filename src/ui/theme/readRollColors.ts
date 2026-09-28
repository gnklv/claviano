import type { RollColors } from '../../infrastructure/render/CanvasPianoRoll';

/** Resolves the current theme's CSS variables into plain colors for the canvas. */
export function readRollColors(): RollColors {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: cssVar('--surface'),
    barLine: cssVar('--grid-line'),
    barNumber: cssVar('--bar-number'),
    loop: cssVar('--loop'),
    nowLine: cssVar('--now-line'),
    whiteKey: cssVar('--key-white'),
    blackKey: cssVar('--key-black'),
    keyBorder: cssVar('--key-border'),
    keyLabel: cssVar('--key-label'),
    pedal: cssVar('--pedal'),
    cursor: cssVar('--cursor'),
    hand: { right: cssVar('--right'), left: cssVar('--left') },
  };
}
