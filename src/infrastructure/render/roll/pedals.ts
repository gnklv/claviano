import type { PedalMove, RollFrame } from '../../../application/ports/RollView';
import { pedalDownAt, pedalEvents, type PedalEvent, type PedalKind, type PedalSpan } from '../../../domain/pedal';
import type { Score } from '../../../domain/score';
import { MUTED_ALPHA, type RollPen } from './ink';

/*
 * The pedals. Where a foot moves, a plain label falls with the notes near the right edge
 * ("Pedal ↓", "Pedal ↑", "Pedal ↑↓" for a change, "Left pedal ↓"…; the staff keeps the sheet-music
 * signs). It lands beside three piano pedals in the corner over the keyboard; each lights up and
 * sinks while held, and comes up for a moment at a change.
 */

const PEDAL_LABEL = {
  size: 13,
  /** An edge of the background's colour round the letters, for them to read over a tile. */
  halo: 3,
  /** Kept this far from the pedals in the corner, and from a label stacked over it. */
  gap: 8,
  leading: 3,
};
/** MIDI players lift and press again in a flash; a gap this short (seconds) is one change. */
const PEDAL_CHANGE_GAP_SECONDS = 0.15;
/** How long (seconds of music) the pedal in the corner stays up at a change, so the change is seen. */
const PEDAL_CHANGE_FLASH_SECONDS = 0.15;
/** The pedals in the corner (pixels): each, the gap between them, from the corner, how far one sinks, its top's corners. */
const PEDAL_ICON = { width: 11, height: 26, gap: 5, margin: 10, travel: 4, corner: 2 };
/** The pedals in the corner, left to right, as on a piano. */
const PEDAL_ORDER: readonly PedalKind[] = ['soft', 'sostenuto', 'sustain'];

/** The pedals of one piece: its moves, worked out once, and drawn at every frame. */
export class RollPedals {
  private readonly moves: Record<PedalKind, PedalEvent[]>;
  /** Every move of every pedal, in time order: where a label falls. */
  private readonly moments: PedalMove[];

  constructor(score: Score) {
    this.moves = {
      sustain: pedalEvents(score.pedal, PEDAL_CHANGE_GAP_SECONDS),
      sostenuto: pedalEvents(score.sostenutoPedal),
      soft: pedalEvents(score.softPedal),
    };
    this.moments = PEDAL_ORDER.flatMap((pedal) => this.moves[pedal].map((move) => ({ ...move, pedal }))).sort((a, b) => a.time - b.time);
  }

  /** Whether the piece moves a pedal at all (if not, nothing of them is drawn). */
  get any(): boolean {
    return this.moments.length > 0;
  }

  /**
   * A label wherever a foot moves, falling with the notes near the right edge, over them with a
   * halo to stay legible: those between `frame.position` and `until`.
   */
  drawLabels({ ctx, colors }: RollPen, frame: RollFrame, yOf: (t: number) => number, rollHeight: number, until: number, width: number): void {
    // Labels land just left of the pedals in the corner, rather than on top of them.
    const { width: w, gap, margin } = PEDAL_ICON;
    const labelRight = width - margin - 3 * w - 2 * gap - PEDAL_LABEL.gap;
    ctx.save();
    ctx.globalAlpha = frame.pedalEnabled ? 1 : MUTED_ALPHA;
    ctx.fillStyle = colors.pedal;
    ctx.strokeStyle = colors.background;
    ctx.lineWidth = PEDAL_LABEL.halo;
    ctx.lineJoin = 'round';
    ctx.font = `600 ${PEDAL_LABEL.size}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    let stacked = 0; // labels of several pedals at one moment stack upwards
    let previous = Number.NaN;
    for (const moment of this.moments) {
      if (moment.time < frame.position) continue;
      if (moment.time > until) break;
      stacked = moment.time === previous ? stacked + 1 : 0;
      previous = moment.time;
      const y = yOf(moment.time);
      if (y > rollHeight) continue;
      const label = frame.pedalLabel(moment);
      const labelY = y - PEDAL_LABEL.leading - stacked * (PEDAL_LABEL.size + PEDAL_LABEL.leading);
      ctx.strokeText(label, labelRight, labelY);
      ctx.fillText(label, labelRight, labelY);
    }
    ctx.restore();
  }

  /** Three piano pedals in the corner over the keyboard, each lit and sunk while held. */
  drawPedals({ ctx, colors }: RollPen, frame: RollFrame, rollHeight: number, width: number): void {
    const { width: w, height: h, gap, margin, travel, corner } = PEDAL_ICON;
    const spans: Record<PedalKind, readonly PedalSpan[]> = {
      sustain: frame.score.pedal,
      sostenuto: frame.score.sostenutoPedal,
      soft: frame.score.softPedal,
    };
    const left = width - margin - 3 * w - 2 * gap;
    const top = rollHeight - margin - h - travel;
    ctx.save();
    ctx.globalAlpha = frame.pedalEnabled ? 1 : MUTED_ALPHA;
    PEDAL_ORDER.forEach((pedal, i) => {
      const down = frame.pedalEnabled && pedalDownAt(spans[pedal], frame.position) && !this.changingAt(pedal, frame.position);
      ctx.fillStyle = down ? colors.pedal : colors.keyBorder;
      ctx.beginPath();
      ctx.roundRect(left + i * (w + gap), top + (down ? travel : 0), w, h, [corner, corner, w / 2, w / 2]);
      ctx.fill();
    });
    ctx.restore();
  }

  /** Whether a pedal is being changed at `time`: lifted and pressed again at once, shown as briefly up. */
  private changingAt(pedal: PedalKind, time: number): boolean {
    // The last move at or before `time` (moves are in time order).
    const moments = this.moves[pedal];
    let lo = 0;
    let hi = moments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (moments[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    const latest = moments[lo - 1];
    return latest?.kind === 'change' && time - latest.time < PEDAL_CHANGE_FLASH_SECONDS;
  }
}
