import type { TilesColors, TilesFrame, TilesView } from '../../application/ports/TilesView';
import { keyPlace, whiteKeys } from '../../domain/keyboard';
import { handBySplitPoint } from '../../domain/note';

/** A second of playing is this tall, in pixels. */
const PX_PER_SECOND = 90;
/** A tile is never thinner than this: the shortest tap is seen. */
const MIN_HEIGHT_PX = 3;

/** The tiles of what has been played, on a canvas: time runs upwards from the canvas's lower edge, which is now. */
export class CanvasPlayedTiles implements TilesView {
  private readonly context: CanvasRenderingContext2D | null;
  private colors: TilesColors;
  private width = 0;
  private height = 0;

  /** `colors`: the theme's, as the interface reads them (and gives anew on a switch: setColors). */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    colors: TilesColors,
  ) {
    this.colors = colors;
    this.context = canvas.getContext('2d');
    this.resize();
  }

  get secondsInSight(): number {
    return this.height / PX_PER_SECOND;
  }

  setColors(colors: TilesColors): void {
    this.colors = colors;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render({ tiles, now, lowest, keys }: TilesFrame): void {
    const { context, width, height } = this;
    if (!context || width === 0) return;
    context.clearRect(0, 0, width, height);
    const white = width / whiteKeys(lowest, keys);
    for (const tile of tiles) {
      const place = keyPlace(tile.pitch, lowest);
      const bottom = height - (now - (tile.end ?? now)) * PX_PER_SECOND;
      const top = height - (now - tile.start) * PX_PER_SECOND;
      if (bottom < 0) continue;
      // (Notes under middle Do are the left hand's, as for any playing that does not say.)
      context.fillStyle = this.colors[handBySplitPoint(tile.pitch)];
      context.beginPath();
      context.roundRect(place.left * white + 1, top, place.width * white - 2, Math.max(MIN_HEIGHT_PX, bottom - top), 3);
      context.fill();
    }
  }
}
