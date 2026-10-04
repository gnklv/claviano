import type { AudioOutput, NoteToPlay } from '../src/application/ports/AudioOutput';
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
