import type { RollColors } from '../../application/ports/RollView';
import type { StaffColors } from '../../application/ports/StaffView';

/* The current theme's CSS variables, resolved into plain colors for the canvases (see useCanvasColors). */

const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The falling notes' colours. */
export function readRollColors(): RollColors {
  return {
    background: cssVar('--surface'),
    barLine: cssVar('--grid-line'),
    barNumber: cssVar('--bar-number'),
    loop: cssVar('--loop'),
    loopEdge: cssVar('--loop-edge'),
    nowLine: cssVar('--now-line'),
    whiteKey: cssVar('--key-white'),
    blackKey: cssVar('--key-black'),
    keyBorder: cssVar('--key-border'),
    keyLabel: cssVar('--key-label'),
    onHand: cssVar('--on-hand'),
    pedal: cssVar('--pedal'),
    cursor: cssVar('--cursor'),
    hand: { right: cssVar('--right'), left: cssVar('--left') },
  };
}

/** The staff's colours. */
export function readStaffColors(): StaffColors {
  return {
    background: cssVar('--surface'),
    staffLine: cssVar('--staff-line'),
    barLine: cssVar('--bar-line'),
    barNumber: cssVar('--bar-number'),
    ink: cssVar('--ink'),
    loop: cssVar('--loop'),
    loopEdge: cssVar('--loop-edge'),
    cursor: cssVar('--cursor'),
    hand: { right: cssVar('--right'), left: cssVar('--left') },
  };
}
