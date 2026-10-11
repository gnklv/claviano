import type { AudioOutput, NoteToPlay, SoundPart } from '../src/application/ports/AudioOutput';
import type { PieceMemory, PieceShelf, ShelvedPiece } from '../src/application/ports/PieceShelf';
import type { Ticker } from '../src/application/ports/Ticker';

/* Stand-ins for the ports, shared by the tests. */

/** An output that plays nothing and remembers what it was asked to play; its clock is set by hand. */
export class FakeAudio implements AudioOutput {
  time = 0;
  played: NoteToPlay[] = [];
  stops = 0;
  now = () => this.time;
  resume = async () => {};
  playNote(note: NoteToPlay): void {
    this.played.push(note);
  }
  pedalMoves: { at: number; down: boolean }[] = [];
  playPedal(at: number, down: boolean): void {
    this.pedalMoves.push({ at, down });
  }
  clicks: { at: number; accent: boolean }[] = [];
  playClick(at: number, accent: boolean): void {
    this.clicks.push({ at, accent });
  }
  volumes: Partial<Record<SoundPart, number>> = {};
  setVolume(part: SoundPart, volume: number): void {
    this.volumes[part] = volume;
  }
  stopAll(): void {
    this.stops++;
  }
}

/** A ticker that ticks when told to. */
export class FakeTicker implements Ticker {
  private callback: (() => void) | null = null;
  start(onTick: () => void): () => void {
    this.callback = onTick;
    return () => (this.callback = null);
  }
  tick(): void {
    this.callback?.();
  }
}

/** A shelf kept in memory; `broken` makes everything it is asked for fail, as storage does in a private window. */
export class FakePieceShelf implements PieceShelf {
  readonly pieces = new Map<string, ShelvedPiece>();
  readonly files = new Map<string, ArrayBuffer>();
  broken = false;
  list(): Promise<ShelvedPiece[]> {
    return this.answer(() => [...this.pieces.values()]);
  }
  file(id: string): Promise<ArrayBuffer | null> {
    return this.answer(() => this.files.get(id) ?? null);
  }
  save(piece: ShelvedPiece, data?: ArrayBuffer): Promise<void> {
    return this.answer(() => {
      this.pieces.set(piece.id, piece);
      if (data) this.files.set(piece.id, data);
    });
  }
  /** (Anything may be put here by hand, as anything may be found in a browser's storage.) */
  readonly remembered = new Map<string, unknown>();
  memories(): Promise<Record<string, unknown>> {
    return this.answer(() => Object.fromEntries(this.remembered));
  }
  remember(id: string, memory: PieceMemory): Promise<void> {
    return this.answer(() => void this.remembered.set(id, memory));
  }
  private answer<T>(work: () => T): Promise<T> {
    return this.broken ? Promise.reject(new Error('no storage')) : Promise.resolve().then(work);
  }
}
