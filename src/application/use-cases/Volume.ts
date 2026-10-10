import type { AudioOutput, SoundPart } from '../ports/AudioOutput';

/**
 * How loud the notes and the metronome are, each from 0 (silent) to 1 (as loud as it is made).
 * Two of them, because what one needs is their balance: a metronome that neither drowns in the
 * piano nor hammers over it. (How loud it all is together is the device's own volume.)
 */
export class Volume {
  private readonly levels: Record<SoundPart, number> = { instrument: 1, metronome: 1 };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly audio: AudioOutput) {}

  of(part: SoundPart): number {
    return this.levels[part];
  }

  set(part: SoundPart, volume: number): void {
    const level = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    if (level === this.levels[part]) return;
    this.levels[part] = level;
    this.audio.setVolume(part, level);
    for (const listener of this.listeners) listener();
  }

  /** Called when a volume changes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
