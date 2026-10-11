/** A key as it was played: when it went down and came up, on the clock the view is told the time of (null: still down). */
export interface PlayedTile {
  readonly pitch: number;
  readonly start: number;
  readonly end: number | null;
}

/** The colours of the two hands' tiles. */
export interface TilesColors {
  readonly right: string;
  readonly left: string;
}

/** One frame: what has been played, the time now, and the stretch of keyboard the tiles stand over. */
export interface TilesFrame {
  readonly tiles: readonly PlayedTile[];
  readonly now: number;
  /** The lowest key of the keyboard under the tiles, and how many keys it has. */
  readonly lowest: number;
  readonly keys: number;
}

/**
 * What has just been played, drawn over a keyboard: each note a tile that rises from its key for
 * as long as the key is held, and floats on up. (The falling notes of a piece, the other way
 * round: there the music comes to the keys; here it leaves them.) How it draws is its own business.
 */
export interface TilesView {
  setColors(colors: TilesColors): void;
  /** Call when the canvas's size changes. */
  resize(): void;
  render(frame: TilesFrame): void;
  /** How long a tile is in sight after its key comes up, in seconds: what is older can be forgotten. */
  readonly secondsInSight: number;
}
