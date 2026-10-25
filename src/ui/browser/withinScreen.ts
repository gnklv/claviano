/**
 * How far to move something across the screen so that it stands inside it, `edge` clear of each
 * side: what lies at `left`, `width` wide (in pixels of the page as it is shown). Nothing, where it
 * fits; where it is wider than the room, it stands against the left edge.
 */
export function nudgeWithinScreen(left: number, width: number, edge: number): number {
  const room = document.documentElement.clientWidth;
  if (left + width > room - edge) return Math.max(edge - left, room - edge - (left + width));
  if (left < edge) return edge - left;
  return 0;
}
