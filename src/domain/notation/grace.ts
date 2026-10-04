/*
 * Grace notes: small notes printed before a note, with no time of their own in the bar. How they
 * are played is a convention:
 *
 * - An acciaccatura (its flag struck through) is crushed in just before the beat; so is a group of
 *   several grace notes. The note they lead to stays on its beat.
 * - An appoggiatura (one grace note, not struck through) leans on the beat itself and takes half
 *   of the note it leads to, or two thirds of a dotted one; that note comes in after it.
 */

/** How long a crushed grace note lasts, in quarter notes: a thirty-second. */
export const CRUSHED_BEATS = 0.125;

export interface GraceGroup {
  /** How many grace notes (or grace chords) are played one after another. */
  readonly count: number;
  /** Struck through: an acciaccatura. */
  readonly slash: boolean;
}

/** The note the grace notes lead to; null when they follow the last note of a bar instead. */
export interface GracePrincipal {
  readonly beats: number;
  readonly dotted: boolean;
}

export interface GraceTiming {
  /** When the first grace note sounds, and how long each one lasts, in quarter notes. */
  readonly start: number;
  readonly each: number;
  /** How much later than its beat the note they lead to comes in (and how much shorter it is). */
  readonly delay: number;
}

/**
 * When the grace notes before `beat` sound. `earliest`: nothing sounds before it (the start of the
 * piece); grace notes with no room before the beat are played on it, quickly, the note after them.
 */
export function graceTiming(group: GraceGroup, principal: GracePrincipal | null, beat: number, earliest = 0): GraceTiming {
  if (principal && group.count === 1 && !group.slash) {
    const taken = principal.beats * (principal.dotted ? 2 / 3 : 1 / 2);
    return { start: beat, each: taken, delay: taken };
  }
  const length = group.count * CRUSHED_BEATS;
  if (beat - length >= earliest - 1e-9) return { start: beat - length, each: CRUSHED_BEATS, delay: 0 };
  // No room before: on the beat, in no more than half of the note they lead to.
  const each = principal ? Math.min(CRUSHED_BEATS, principal.beats / 2 / group.count) : CRUSHED_BEATS;
  return { start: beat, each, delay: principal ? group.count * each : 0 };
}
