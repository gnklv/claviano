
/*
 * Beams: the bars that join the stems of eighths, sixteenths and thirty-seconds instead of flags.
 * Here, where a beam is drawn; which notes share one is music theory (domain/notation/beaming).
 */

/** A stem's horizontal place and the notehead nearest the beam (its y), in pixels. */
export interface StemPoint {
  readonly x: number;
  readonly noteY: number;
}

/** The line along a beam's outer edge: y = y0 + slope × (x − x0). */
export interface BeamLine {
  readonly x0: number;
  readonly y0: number;
  readonly slope: number;
}

export const beamY = (line: BeamLine, x: number): number => line.y0 + line.slope * (x - line.x0);

/**
 * Where to put a beam. It follows the direction of the melody from the first to the last note,
 * but tilts at most `maxRise` over its length and never steeper than `maxSlope` (short beams
 * would otherwise look like slashes); then it moves away from the notes as far as needed for
 * every stem to be at least `minStem` long.
 */
export function beamLine(
  points: readonly StemPoint[],
  stemUp: boolean,
  { stem, minStem, maxRise, maxSlope = 0.25 }: { stem: number; minStem: number; maxRise: number; maxSlope?: number },
): BeamLine {
  const first = points[0];
  const last = points[points.length - 1];
  const direction = stemUp ? -1 : 1; // screen y grows downwards
  const firstEnd = first.noteY + direction * stem;
  const lastEnd = last.noteY + direction * stem;
  const limit = Math.min(maxRise, maxSlope * (last.x - first.x));
  const rise = Math.max(-limit, Math.min(limit, lastEnd - firstEnd));
  const slope = last.x > first.x ? rise / (last.x - first.x) : 0;

  let line: BeamLine = { x0: first.x, y0: firstEnd, slope };
  // How far each stem falls short of the minimum; move the whole beam by the worst shortfall.
  const shortfall = Math.max(0, ...points.map((p) => minStem - direction * (beamY(line, p.x) - p.noteY)));
  line = { ...line, y0: line.y0 + direction * shortfall };
  return line;
}

/**
 * A beam whose stems point both ways, as when a group runs across both staves (the Moonlight
 * Sonata's triplets start in the bass and go on in the treble): up-stems from the notes below,
 * down-stems from the notes above, meeting a beam in the gap between them. The beam follows the
 * melody down or up, half as steeply (or a quarter), and lies in the middle of the room it has
 * there (every stem at least `minStem` long); where a slant leaves no such room, it lies level.
 */
export function kneeBeamLine(points: readonly (StemPoint & { readonly stemUp: boolean })[], minStem: number): BeamLine {
  const first = points[0];
  const last = points[points.length - 1];
  const melody = last.x > first.x ? (last.noteY - first.noteY) / (last.x - first.x) : 0;
  for (const slope of [melody / 2, melody / 4, 0]) {
    // For this slope, how high and how low the beam may start (y grows downwards).
    const along = (p: StemPoint) => slope * (p.x - first.x);
    const lowest = Math.max(...points.filter((p) => !p.stemUp).map((p) => p.noteY + minStem - along(p)));
    const highest = Math.min(...points.filter((p) => p.stemUp).map((p) => p.noteY - minStem - along(p)));
    if (lowest <= highest || slope === 0) return { x0: first.x, y0: (lowest + highest) / 2, slope };
  }
  return { x0: first.x, y0: first.noteY, slope: 0 }; // not reached: the level try always returns
}

/** A notehead of another voice, in pixels: where it is and how far up and down it reaches. */
export interface BeamObstacle {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Moves a beam off the noteheads of another voice on its staff. Two voices beamed at once (stems
 * up in one, down in the other) easily put a beam across the other voice's notes. The beam first
 * moves towards its own notes, as far as its stems stay at least `shortestStem` long; if that is
 * not enough, it moves away, past the other notes. `band` is the beam's height with all its levels.
 */
export function avoidNotes(
  line: BeamLine,
  points: readonly StemPoint[],
  stemUp: boolean,
  obstacles: readonly BeamObstacle[],
  { band, clearance, shortestStem }: { band: number; clearance: number; shortestStem: number },
): BeamLine {
  // The beam's extent at x: from its outer edge (the line) inwards, towards the notes.
  const extent = (l: BeamLine, x: number) => (stemUp ? [beamY(l, x), beamY(l, x) + band] : [beamY(l, x) - band, beamY(l, x)]);
  const hits = obstacles.filter((o) => {
    const [top, bottom] = extent(line, o.x);
    return o.bottom + clearance > top && o.top - clearance < bottom;
  });
  if (hits.length === 0) return line;

  const moved = (shift: number): BeamLine => ({ ...line, y0: line.y0 + shift });
  const stemsLongEnough = (l: BeamLine) =>
    points.every((p) => (stemUp ? p.noteY - beamY(l, p.x) : beamY(l, p.x) - p.noteY) >= shortestStem);

  // Towards the notes: the beam's inner edge ends up clear of the other voice.
  const inward = stemUp
    ? Math.max(...hits.map((o) => o.bottom + clearance - beamY(line, o.x)))
    : Math.min(...hits.map((o) => o.top - clearance - beamY(line, o.x)));
  const closer = moved(inward);
  if (stemsLongEnough(closer)) return closer;

  // Away from the notes, past the other voice.
  const outward = stemUp
    ? Math.min(...hits.map((o) => o.top - clearance - band - beamY(line, o.x)))
    : Math.max(...hits.map((o) => o.bottom + clearance + band - beamY(line, o.x)));
  return moved(outward);
}
