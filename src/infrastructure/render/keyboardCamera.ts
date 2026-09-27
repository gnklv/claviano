/**
 * The "camera" over a keyboard wider than the screen: which horizontal slice to show.
 * All values are pixels along the full keyboard; `offset` is the left edge of the visible slice.
 */

export interface CameraView {
  /** Width of the whole keyboard. */
  readonly contentWidth: number;
  /** Width of the visible slice (the screen). */
  readonly viewWidth: number;
}

/** Horizontal extent of some keys, e.g. of the notes about to be played. */
export interface Span {
  readonly left: number;
  readonly right: number;
}

export function clampOffset(offset: number, view: CameraView): number {
  return Math.min(Math.max(0, offset), Math.max(0, view.contentWidth - view.viewWidth));
}

/**
 * A lazy camera: it stays put while the upcoming notes are all visible (with `margin` to spare),
 * and otherwise moves just enough to show them. Upcoming notes wider than the screen get centred.
 * Staying put matters: a keyboard that drifts for no reason loses "this key is right here".
 */
export function followTarget(current: number, upcoming: Span | null, view: CameraView, margin: number): number {
  if (!upcoming) return clampOffset(current, view);
  const left = upcoming.left - margin;
  const right = upcoming.right + margin;

  let target = current;
  if (right - left > view.viewWidth) target = (upcoming.left + upcoming.right) / 2 - view.viewWidth / 2;
  else if (left < current) target = left;
  else if (right > current + view.viewWidth) target = right - view.viewWidth;
  return clampOffset(target, view);
}

/**
 * Chooses what to follow when the notes don't all fit on screen. `spans` go from the farthest
 * look-ahead to the nearest (e.g. notes of the next 2 s, 1 s, 0.5 s): the first one that fits wins,
 * so what is about to be played takes priority over what comes later.
 * If none fits, the nearest is returned (followTarget then centres it).
 */
export function pickSpan(spans: readonly (Span | null)[], viewWidth: number, margin: number): Span | null {
  let nearest: Span | null = null;
  for (const span of spans) {
    if (!span) continue;
    if (span.right - span.left + 2 * margin <= viewWidth) return span;
    nearest = span;
  }
  return nearest;
}

/**
 * Moves `current` toward `target` smoothly: fast at first, slowing down as it arrives.
 * Frame-rate independent, so it looks the same at 60 and 120 fps.
 */
export function approach(current: number, target: number, dtSeconds: number, timeConstant = 0.2): number {
  const next = current + (target - current) * (1 - Math.exp(-dtSeconds / timeConstant));
  return Math.abs(target - next) < 0.5 ? target : next;
}
