/*
 * Words printed in the music, other than those that have a place of their own (dynamics such as
 * "cresc.", the left pedal's "una corda", the words of a jump such as "D.S. al Coda"):
 *
 * - the tempo: "Allegro", "Adagio sostenuto": in bold over the upper staff, where a metronome
 *   mark follows it on the same line;
 * - the character, a way of playing, a change of pace: "tranquillo", "senza sordini", "rit.": in
 *   italics, over the upper staff or under it.
 */
export interface WordsMark {
  /** Where they stand along the page, in quarter notes. */
  readonly beat: number;
  readonly text: string;
  /** Printed as a tempo: in bold, with the metronome mark. */
  readonly tempo: boolean;
  /** Under the upper staff (between the staves) rather than over it. */
  readonly below: boolean;
}

/** A bare number among the words is no word: notation editors keep hidden tempo changes that way. */
export const isWords = (text: string): boolean => text !== '' && !/^[\d.,\s]+$/.test(text);
