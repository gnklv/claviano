import { sameMoment } from '../../domain/moment';
import type { Finger } from '../../domain/fingering/hand';
import { onThePage, type NoteOnPage, type OwnFinger } from '../../domain/fingering/own';
import type { Score } from '../../domain/score';
import type { Playback } from './Playback';

/*
 * One's own fingering of the open piece: a finger set by hand at a note of the page, or taken away
 * (see domain/fingering/own.ts for what it is). Kept with the piece.
 */

export class OwnFingering {
  private fingers: OwnFinger[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly playback: Playback) {
    // A new piece has fingers of its own (set again from what is remembered of it, if anything).
    let score: Score | null = playback.score;
    playback.onChange(() => {
      if (playback.score === score) return;
      score = playback.score;
      if (this.fingers.length === 0) return;
      this.fingers = [];
      this.emit();
    });
  }

  get all(): readonly OwnFinger[] {
    return this.fingers;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The fingers as they were left with the piece; those at notes it no longer has (the file was
   * changed since) are let go of.
   */
  set(fingers: readonly OwnFinger[]): void {
    this.fingers = this.playback.score ? onThePage(this.playback.score, fingers) : [...fingers];
    this.emit();
  }

  /** `finger` at the note, in place of any set there before; null takes it away. */
  setFinger(note: NoteOnPage, finger: Finger | null): void {
    const others = this.fingers.filter((each) => !(sameMoment(each.beat, note.beat) && each.pitch === note.pitch));
    if (finger === null && others.length === this.fingers.length) return;
    this.fingers = finger === null ? others : [...others, { beat: note.beat, pitch: note.pitch, finger }];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
