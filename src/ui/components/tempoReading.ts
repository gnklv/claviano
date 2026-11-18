import type { NoteValue, WrittenDuration } from '../../domain/notation/noteValue';

/** A tempo as the page writes it: the note that counts as a beat, and how many of them a minute. */
export interface TempoReading {
  unit: NoteValue;
  dots: WrittenDuration['dots'];
  perMinute: number;
}
