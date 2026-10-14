import type { NotationLayout, StaffChord } from '../../../domain/notation/engraving';
import type { Column } from '../../../domain/notation/spacing';
import { barAtBeat, barLength, writtenBarStart, type Score } from '../../../domain/score';
import { ACCIDENTAL_COLUMN } from './chords';
import { HEAD_WIDTH } from './glyphs';
import { graceWidth } from './graces';

/*
 * What stands at each moment of each printed bar, and the room it takes as it is drawn here (see
 * domain/notation/spacing.ts, which sets the bars out by it). In staff spaces.
 */

/** An accidental before a head, with the gap to it. */
const ACCIDENTAL = 1.6;
/** A dot after a head, with the gap to it. */
const DOT = 0.75;
/** The flag of a note that is not beamed, on an up-stem: it hangs to the right of the head. */
const FLAG = 0.9;
/** The wavy line of a rolled chord, before the chord and its accidentals. */
const ARPEGGIO = 1.3;
/** The small clef of a change of clef, with the gap to the note after it (it is drawn 2.6 before the note's place). */
export const CLEF_CHANGE = 2.9;
/** A rest. */
const REST = 1.2;
const FLAGGED = new Set(['eighth', 'sixteenth', 'thirtySecond']);

/** For each printed bar, its columns. */
export function columnsOf(score: Score, layout: NotationLayout): Column[][] {
  const bars: Column[][] = score.notation.bars.map(() => []);
  const share = (bar: number, beat: number) => (beat - writtenBarStart(score, bar)) / (barLength(score, bar) || 1);

  const rolled = new Set(layout.arpeggios.flatMap((arpeggio) => arpeggio.chords));
  const graced = new Map<number, number>();
  for (const grace of layout.graces) {
    if (grace.principal === null) continue;
    const principal = layout.chords[grace.principal]!;
    const width = graceWidth(grace, principal.notes.some((note) => note.accidental));
    graced.set(grace.principal, Math.max(graced.get(grace.principal) ?? 0, width));
  }

  layout.chords.forEach((chord, index) => {
    const before = Math.max(accidentalRoom(chord), graced.get(index) ?? 0) + (rolled.has(index) ? ARPEGGIO : 0) + (displacedLeft(chord) ? headWidth(chord) : 0);
    bars[chord.bar]?.push({ at: share(chord.bar, chord.beat), before, after: roomAfter(chord) });
  });
  // A change of clef inside a bar: the small clef stands before the first note it is for.
  for (const change of score.notation.clefs) {
    const bar = barAtBeat(score, change.beat);
    const at = share(bar, change.beat);
    if (at > 1e-6) bars[bar]?.push({ at, before: CLEF_CHANGE, after: 0 });
  }
  for (const rest of layout.rests) {
    const bar = barAtBeat(score, rest.beat);
    bars[bar]?.push({ at: share(bar, rest.beat), before: 0, after: REST });
  }
  return bars;
}

const headWidth = (chord: StaffChord): number => HEAD_WIDTH[chord.duration.value] * (chord.small ? 0.7 : 1);
/** As many columns of accidentals as the chord has (see accidentalsInColumns). */
function accidentalRoom(chord: StaffChord): number {
  const sharpened = chord.notes.filter((note) => note.accidental);
  if (sharpened.length === 0) return 0;
  return ACCIDENTAL + Math.max(...sharpened.map((note) => note.accidentalColumn ?? 0)) * ACCIDENTAL_COLUMN;
}
/** A head moved over to the left of a down-stem. */
const displacedLeft = (chord: StaffChord): boolean => !chord.stemUp && chord.notes.some((note) => note.displaced);

function roomAfter(chord: StaffChord): number {
  const head = headWidth(chord);
  const movedOver = (chord.stemUp && chord.notes.some((note) => note.displaced) ? head : 0) + (chord.voiceShift || chord.dotsPastVoice ? head : 0);
  const flag = chord.beam === null && chord.stemUp && FLAGGED.has(chord.duration.value) ? FLAG : 0;
  return head + movedOver + Math.max(chord.duration.dots * DOT, flag);
}
