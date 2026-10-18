import { SAME_MOMENT, sameMoment } from '../moment';
import type { Hand } from '../note';
import type { WrittenNote } from '../notation/written';
import { writtenBarStart, type Score } from '../score';
import { lastAtOrBefore } from '../search';
import type { Finger } from './hand';

/*
 * One's own fingering: a finger set by hand at a note of the page. It stands as a finger the notes
 * themselves give: printed as theirs, and the hints are fitted round it (see hints.ts).
 *
 * A note is told by where it stands on the page and what it sounds (its beat and its pitch), not by
 * its place in a list: the same piece read again gives the same notes, whatever else changes.
 */

/** A note of the page: where it stands (in quarter notes along the page) and what it sounds. */
export interface NoteOnPage {
  readonly beat: number;
  readonly pitch: number;
  readonly hand: Hand;
}

/** A finger set by hand, at a note of the page. */
export interface OwnFinger {
  readonly beat: number;
  readonly pitch: number;
  readonly finger: Finger;
}

/** The written fingering of a note: its text, and whether it was worked out (a hint) or set by hand. */
export type Fingering = NonNullable<WrittenNote['fingering']>;

const at = (note: { readonly beat: number }, other: { readonly beat: number }): boolean => sameMoment(note.beat, other.beat);

/** Those of the fingers whose note is on the page: what a piece changed since has let go of. */
export function onThePage(score: Score, fingers: readonly OwnFinger[]): OwnFinger[] {
  return fingers.filter((finger) => score.notation.notes.some((note) => !note.tieStop && at(note, finger) && note.sounding === finger.pitch));
}

/** The piece with one's own fingers written in, over what the notes give. */
export function withOwnFingers(score: Score, fingers: readonly OwnFinger[]): Score {
  if (fingers.length === 0) return score;
  const notes = score.notation.notes.map((note) => {
    const own = fingers.find((finger) => at(finger, note) && finger.pitch === note.sounding);
    return own ? { ...note, fingering: { text: String(own.finger), below: null, own: true } } : note;
  });
  return { ...score, notation: { ...score.notation, notes } };
}

/** The finger written at a note of the page (given, worked out or set by hand), if any. */
export function fingeringAt(score: Score, note: NoteOnPage): Fingering | null {
  return score.notation.notes.find((each) => at(each, note) && each.sounding === note.pitch)?.fingering ?? null;
}

/**
 * The fingering for each played note of the piece (as they stand in `score.notes`), from the note of
 * the page it plays: a repeated bar has it on every pass.
 */
export function playedFingers(score: Score): (Fingering | null)[] {
  const written = new Map<string, Fingering>();
  for (const note of score.notation.notes) if (note.fingering) written.set(key(note.beat, note.sounding), note.fingering);
  if (written.size === 0) return score.notes.map(() => null);
  return score.notes.map((note) => written.get(key(pageBeat(score, note.beat), note.pitch)) ?? null);
}

/** The note of the page that the played note at `index` (in `score.notes`) plays, if the page has it. */
export function noteOnPage(score: Score, index: number): NoteOnPage | null {
  const played = score.notes[index];
  if (!played) return null;
  const beat = pageBeat(score, played.beat);
  const note = score.notation.notes.find((each) => !each.tieStop && each.sounding === played.pitch && sameMoment(each.beat, beat));
  return note ? { beat: note.beat, pitch: note.sounding, hand: note.hand } : null;
}

/** The played notes (their places in `score.notes`) that play a note of the page: one on each pass. */
export function playedOf(score: Score, note: NoteOnPage): number[] {
  const found: number[] = [];
  score.notes.forEach((each, index) => {
    if (each.pitch === note.pitch && sameMoment(pageBeat(score, each.beat), note.beat)) found.push(index);
  });
  return found;
}

/** Where a moment of the playing stands on the page: as far into its printed bar as into the bar it is played in. */
function pageBeat(score: Score, beat: number): number {
  const played = Math.max(0, lastAtOrBefore(score.barBeats, beat + SAME_MOMENT, itself));
  const bar = score.barWritten[played] ?? played;
  return beat - (score.barBeats[played] ?? 0) + writtenBarStart(score, bar);
}

/** (To a thousandth of a beat: what arithmetic leaves of a triplet is far less.) */
const key = (beat: number, pitch: number): string => `${Math.round(beat * 1000)}|${pitch}`;
const itself = (value: number): number => value;
