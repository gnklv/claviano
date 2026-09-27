import {
  beatAt,
  keySignatureAt,
  timeSignatureAt,
  type KeySignature,
  type Score,
  type TimeRange,
  type TimeSignature,
} from '../../domain/score';
import { barPosition, keySignatureSteps, type Clef } from './staffLayout';

const SVG_NS = 'http://www.w3.org/2000/svg';

/*
 * All sizes are in staff spaces (the distance between two staff lines),
 * so the whole staff scales with the height of the view.
 */
const LINES_PER_STAFF = 5;
/** Between the bottom line of the treble staff and the top line of the bass staff. */
const STAFF_GAP = 6;
/** Height the staff needs, including room for ledger lines and bar numbers. */
const CONTENT_HEIGHT = 24;
const MIN_SPACE_PX = 6;
const MAX_SPACE_PX = 14;
/** About this many bars fit on the tape, within the bar width limits below. */
const BARS_VISIBLE = 2.2;
/** Narrower bars would not leave room for notes; wider ones waste a wide screen. */
const MIN_BAR_WIDTH = 16;
const MAX_BAR_WIDTH = 40;
/*
 * The left column does not scroll: clefs, then the key signature, then the time signature.
 * Its width fits the widest signatures of the piece, so a key change doesn't shift the tape.
 */
const CLEF_AREA = 4.2;
const SHARP_ADVANCE = 1.1;
const FLAT_ADVANCE = 1.0;
const TIME_DIGIT_WIDTH = 1.8;
const SIGNATURE_GAP = 0.6;
const GUTTER_END_GAP = 1.2;
/** The cursor stands at this share of the tape's width, leaving room to read ahead. */
const CURSOR_AT = 0.3;
/** Share of the tape's width over which each edge fades out. */
const FADE = 0.12;

/** Theme colors, defined as CSS variables in ui/styles.css; the browser recolors on a theme switch. */
const COLORS = {
  background: 'var(--surface)',
  staffLine: 'var(--staff-line)',
  barLine: 'var(--bar-line)',
  barNumber: 'var(--bar-number)',
  clef: 'var(--ink)',
  loop: 'var(--loop)',
  cursor: 'var(--cursor)',
};

/*
 * Glyphs of the SMuFL standard (Bravura font). By the standard, a font size of 4 staff spaces
 * makes glyphs the right size for the staff, and each glyph's baseline is its reference line.
 */
const MUSIC_FONT = 'Bravura';
const G_CLEF = '\uE050';
const F_CLEF = '\uE062';
const SHARP = '\uE262';
const FLAT = '\uE260';
/** Time signature digits 0–9 are consecutive code points from U+E080. */
const timeDigits = (value: number) =>
  [...String(value)].map((digit) => String.fromCodePoint(0xe080 + Number(digit))).join('');
const digitCount = (value: number) => String(value).length;

/** Paint goes through `style`, not attributes: only CSS understands var(--…) colors. */
const PAINT = new Set(['fill', 'stroke']);

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (PAINT.has(name)) element.style.setProperty(name, String(value));
    else element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * A grand staff shown as a tape that scrolls under a fixed cursor.
 *
 * Three layers: staff lines and clefs that never move, the tape with bar lines (and later notes)
 * that slides left, and the cursor on top. The whole tape is built once per score; during
 * playback only its transform changes, which is cheap for the browser.
 */
export class SvgStaff {
  private readonly background: SVGSVGElement;
  private readonly tape: HTMLDivElement;
  private readonly tapeSvg: SVGSVGElement;
  private readonly strip: SVGGElement;
  private readonly cursor: HTMLDivElement;

  private score: Score | null = null;
  private loop: TimeRange | null = null;
  /** One staff space in pixels. */
  private space = 10;
  private width = 0;
  private height = 0;
  private lastOffset = Number.NaN;
  /** Width of the left column in staff spaces, fitted to the piece's signatures. */
  private gutterSpaces = CLEF_AREA + GUTTER_END_GAP;
  /** Beat under the cursor; the left column shows the signatures in force there. */
  private currentBeat = 0;
  /** Which signatures the left column shows now; it is redrawn when they change. */
  private shownSignatures = '';

  constructor(private readonly container: HTMLElement) {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = COLORS.background;

    this.background = svg('svg');
    Object.assign(this.background.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });

    this.tape = document.createElement('div');
    const fade = `linear-gradient(to right, transparent 0, #000 ${FADE * 100}%, #000 ${(1 - FADE) * 100}%, transparent 100%)`;
    Object.assign(this.tape.style, { position: 'absolute', top: '0', bottom: '0', right: '0' });
    this.tape.style.maskImage = fade;
    this.tape.style.setProperty('-webkit-mask-image', fade);
    this.tapeSvg = svg('svg');
    Object.assign(this.tapeSvg.style, { display: 'block', width: '100%', height: '100%' });
    this.strip = svg('g');
    this.tapeSvg.append(this.strip);
    this.tape.append(this.tapeSvg);

    this.cursor = document.createElement('div');
    Object.assign(this.cursor.style, { position: 'absolute', width: '2px', background: COLORS.cursor, borderRadius: '1px' });

    container.append(this.background, this.tape, this.cursor);
    this.resize();
  }

  setScore(score: Score | null): void {
    this.score = score;
    this.currentBeat = 0;
    this.gutterSpaces = this.fitGutter(score);
    this.drawBackground();
    this.drawStrip();
  }

  setLoop(loop: TimeRange | null): void {
    this.loop = loop;
    this.drawStrip();
  }

  /** Call when the container's size changes. */
  resize(): void {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.space = Math.min(MAX_SPACE_PX, Math.max(MIN_SPACE_PX, this.height / CONTENT_HEIGHT));
    this.drawBackground();
    this.drawStrip();
  }

  /** Called every frame; touches the DOM only when the tape actually moves. */
  render(position: number): void {
    if (this.score) {
      this.currentBeat = beatAt(this.score, position);
      if (this.signaturesKey() !== this.shownSignatures) this.drawBackground();
    }
    const x = this.score ? barPosition(this.score, position) * this.barWidth() : 0;
    const offset = Math.round((this.cursorX() - x) * 10) / 10;
    if (offset === this.lastOffset) return;
    this.lastOffset = offset;
    this.strip.setAttribute('transform', `translate(${offset} 0)`);
  }

  // --- Geometry (pixels) ---

  private gutterWidth(): number {
    return this.gutterSpaces * this.space;
  }

  /** Room for the clefs plus the widest key and time signatures that occur in the piece. */
  private fitGutter(score: Score | null): number {
    if (!score || score.notes.length === 0) return CLEF_AREA + GUTTER_END_GAP;
    const keyWidth = Math.max(...score.keySignatures.map((key) => keySignatureWidth(key)));
    const timeWidth = Math.max(...score.timeSignatures.map((time) => timeSignatureWidth(time)));
    return CLEF_AREA + keyWidth + timeWidth + GUTTER_END_GAP;
  }

  private currentSignatures(): { key: KeySignature; time: TimeSignature } | null {
    const score = this.score;
    if (!score || score.notes.length === 0) return null;
    return { key: keySignatureAt(score, this.currentBeat), time: timeSignatureAt(score, this.currentBeat) };
  }

  private signaturesKey(): string {
    const current = this.currentSignatures();
    return current ? `${current.key.fifths} ${current.time.numerator}/${current.time.denominator}` : '';
  }

  /** Bar width in pixels: about two bars on the tape, so phones see what comes next too. */
  private barWidth(): number {
    const tapeWidth = this.width - this.gutterWidth();
    const spaces = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, tapeWidth / BARS_VISIBLE / this.space));
    return spaces * this.space;
  }

  /** Cursor position inside the tape. */
  private cursorX(): number {
    return (this.width - this.gutterWidth()) * CURSOR_AT;
  }

  private trebleTop(): number {
    const systemHeight = (2 * (LINES_PER_STAFF - 1) + STAFF_GAP) * this.space;
    return (this.height - systemHeight) / 2;
  }

  private bassTop(): number {
    return this.trebleTop() + (LINES_PER_STAFF - 1 + STAFF_GAP) * this.space;
  }

  private systemBottom(): number {
    return this.bassTop() + (LINES_PER_STAFF - 1) * this.space;
  }

  // --- Drawing ---

  private drawBackground(): void {
    const { space } = this;
    const gutter = this.gutterWidth();
    this.background.replaceChildren();

    for (const top of [this.trebleTop(), this.bassTop()]) {
      for (let line = 0; line < LINES_PER_STAFF; line++) {
        const y = top + line * space;
        this.background.append(
          svg('line', { x1: space * 0.5, x2: this.width, y1: y, y2: y, stroke: COLORS.staffLine, 'stroke-width': 1 }),
        );
      }
    }

    // The line joining both staves at the start of the system.
    this.background.append(
      svg('line', {
        x1: space * 0.5,
        x2: space * 0.5,
        y1: this.trebleTop(),
        y2: this.systemBottom(),
        stroke: COLORS.barLine,
        'stroke-width': 1.5,
      }),
    );

    // The treble (G) clef sits on the G line, second from the bottom; the bass (F) clef on the F line,
    // second from the top.
    this.background.append(
      this.glyph(G_CLEF, space * 1.2, this.trebleTop() + 3 * space),
      this.glyph(F_CLEF, space * 1.2, this.bassTop() + 1 * space),
    );

    this.drawSignatures();

    this.tape.style.left = `${gutter}px`;
    Object.assign(this.cursor.style, {
      left: `${gutter + this.cursorX() - 1}px`,
      top: `${this.trebleTop() - 2 * space}px`,
      height: `${(this.systemBottom() - this.trebleTop()) + 4 * space}px`,
    });
    this.lastOffset = Number.NaN;
  }

  /** Key signature and time signature after the clefs, on both staves. */
  private drawSignatures(): void {
    const current = this.currentSignatures();
    this.shownSignatures = this.signaturesKey();
    if (!current) return;
    const { key, time } = current;
    const { space } = this;
    const staves: [Clef, number][] = [
      ['treble', this.trebleTop()],
      ['bass', this.bassTop()],
    ];

    // Each accidental sits on its line or space: a step is half a staff space.
    const keyX = CLEF_AREA * space;
    const advance = (key.fifths >= 0 ? SHARP_ADVANCE : FLAT_ADVANCE) * space;
    for (const [clef, top] of staves) {
      keySignatureSteps(key.fifths, clef).forEach((step, index) => {
        this.background.append(this.glyph(key.fifths > 0 ? SHARP : FLAT, keyX + index * advance, top + (step * space) / 2));
      });
    }

    // Time signature digits are two spaces tall and centred on their baseline:
    // the numerator fills the upper half of the staff, the denominator the lower half.
    const timeCenter = keyX + keySignatureWidth(key) * space + (timeSignatureWidth(time) * space) / 2;
    for (const [, top] of staves) {
      this.background.append(
        this.glyph(timeDigits(time.numerator), timeCenter, top + space, 'middle'),
        this.glyph(timeDigits(time.denominator), timeCenter, top + 3 * space, 'middle'),
      );
    }
  }

  /** A SMuFL glyph whose reference line (baseline) is at `y`. */
  private glyph(codepoint: string, x: number, y: number, anchor: 'start' | 'middle' = 'start'): SVGTextElement {
    const text = svg('text', {
      x,
      y,
      fill: COLORS.clef,
      'font-size': this.space * 4,
      'font-family': MUSIC_FONT,
      'text-anchor': anchor,
    });
    text.textContent = codepoint;
    return text;
  }

  private drawStrip(): void {
    this.strip.replaceChildren();
    const score = this.score;
    if (!score || score.notes.length === 0) return;

    const { space } = this;
    const barWidth = this.barWidth();
    const top = this.trebleTop();
    const bottom = this.systemBottom();

    if (this.loop) {
      const start = barPosition(score, this.loop.start) * barWidth;
      const end = barPosition(score, this.loop.end) * barWidth;
      this.strip.append(
        svg('rect', { x: start, y: top - 3 * space, width: end - start, height: bottom - top + 6 * space, fill: COLORS.loop }),
      );
    }

    score.bars.forEach((_, index) => {
      const x = index * barWidth;
      this.strip.append(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
      const number = svg('text', {
        x: x + space * 0.4,
        y: top - space * 1.2,
        fill: COLORS.barNumber,
        'font-size': space * 1.1,
        'font-family': 'system-ui, sans-serif',
      });
      number.textContent = String(index + 1);
      this.strip.append(number);
    });

    // Final bar line: a thin and a thick one.
    const end = score.bars.length * barWidth;
    this.strip.append(
      svg('line', { x1: end - space * 0.6, x2: end - space * 0.6, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }),
      svg('line', { x1: end, x2: end, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': space * 0.4 }),
    );
    this.lastOffset = Number.NaN;
  }
}

/** Width of a key signature in staff spaces, including the gap after it. */
function keySignatureWidth({ fifths }: KeySignature): number {
  if (fifths === 0) return 0;
  return Math.abs(fifths) * (fifths > 0 ? SHARP_ADVANCE : FLAT_ADVANCE) + SIGNATURE_GAP;
}

/** Width of a time signature in staff spaces, set by its longer number (e.g. 12 in 12/8). */
function timeSignatureWidth({ numerator, denominator }: TimeSignature): number {
  return Math.max(digitCount(numerator), digitCount(denominator)) * TIME_DIGIT_WIDTH;
}
