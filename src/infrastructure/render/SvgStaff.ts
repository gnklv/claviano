import {
  barNumber,
  beatAt,
  keySignatureAt,
  timeSignatureAt,
  type KeySignature,
  type Score,
  type TimeRange,
  type TimeSignature,
} from '../../domain/score';
import type { Hand } from '../../domain/note';
import { flagCount, type NoteValue } from '../../domain/notation/noteValue';
import type { Accidental } from '../../domain/notation/spelling';
import { beamLine, beamY } from './beams';
import { layoutNotation, type Beam, type StaffChord } from './notationLayout';
import { barPosition, keySignatureSteps, tapeBars, type Clef } from './staffLayout';

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
/*
 * Notes sit on the tape exactly where their beat is, so the cursor crosses a notehead when it
 * sounds. Bar lines are drawn a little before the bar's first beat to leave room for its note.
 */
const BAR_LINE_GAP = 1.4;
/** Notehead widths (Bravura), for centring heads on their beat. */
const HEAD_WIDTH: Record<NoteValue, number> = {
  whole: 1.69,
  half: 1.18,
  quarter: 1.18,
  eighth: 1.18,
  sixteenth: 1.18,
  thirtySecond: 1.18,
};
const STEM_LENGTH = 3.5;
/** Longer stems for three flags, so the flags don't run into the notehead. */
const STEM_LENGTH_32ND = 4.25;
const STEM_WIDTH = 0.12;
const LEDGER_EXTENSION = 0.4;
const ACCIDENTAL_OFFSET = 1.3;
/** Beams: thickness, distance between stacked beams, stub length for a lone shorter note. */
const BEAM_THICKNESS = 0.5;
const BEAM_SPACING = 0.75;
const BEAM_STUB = 1.2;
/** A beam tilts at most this much from end to end, and every stem keeps at least MIN_BEAMED_STEM. */
const BEAM_MAX_RISE = 1;
const MIN_BEAMED_STEM = 2.5;
const DOT_OFFSET = 0.35;
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
  note: 'var(--ink)',
  hand: { right: 'var(--right)', left: 'var(--left)' } satisfies Record<Hand, string>,
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
const NATURAL = '\uE261';
const ACCIDENTAL_GLYPH: Record<Accidental, string> = { sharp: SHARP, flat: FLAT, natural: NATURAL };
const NOTEHEAD: Record<NoteValue, string> = {
  whole: '\uE0A2',
  half: '\uE0A3',
  quarter: '\uE0A4',
  eighth: '\uE0A4',
  sixteenth: '\uE0A4',
  thirtySecond: '\uE0A4',
};
/** Flags by count (1–3), stem up and stem down. */
const FLAG_UP = ['', '\uE240', '\uE242', '\uE244'];
const FLAG_DOWN = ['', '\uE241', '\uE243', '\uE245'];
const AUGMENTATION_DOT = '\uE1E7';
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
  /** The piece laid out as chords, sorted by start time, and their drawn groups (same indices). */
  private chords: StaffChord[] = [];
  private beams: Beam[] = [];
  private chordElements: SVGGElement[] = [];
  private longestChord = 0;
  /** Chords currently highlighted in their hand's color. */
  private readonly lit = new Set<number>();
  /** Hand marks for notes written on the other hand's staff ("L.H." / "л. р."), in the UI language. */
  private handLabels: Record<Hand, string> = { right: 'R.H.', left: 'L.H.' };

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
    const layout = score ? layoutNotation(score) : { chords: [], beams: [] };
    this.chords = [...layout.chords];
    this.beams = [...layout.beams];
    this.longestChord = this.chords.reduce((max, chord) => Math.max(max, chord.end - chord.start), 0);
    this.currentBeat = 0;
    this.gutterSpaces = this.fitGutter(score);
    this.drawBackground();
    this.drawStrip();
  }

  setHandLabels(labels: Record<Hand, string>): void {
    this.handLabels = labels;
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

  /**
   * Called every frame; touches the DOM only when something changes: the tape moves,
   * or a chord starts or stops sounding. Chords of muted hands are not highlighted.
   */
  render(position: number, isHandEnabled: (hand: Hand) => boolean = () => true): void {
    if (this.score) {
      this.currentBeat = beatAt(this.score, position);
      if (this.signaturesKey() !== this.shownSignatures) this.drawBackground();
      this.highlight(position, isHandEnabled);
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
    this.lit.clear();
    this.chordElements = [];
    const score = this.score;
    if (!score || score.notes.length === 0) return;

    const { space } = this;
    const barWidth = this.barWidth();
    const gap = BAR_LINE_GAP * space;
    const top = this.trebleTop();
    const bottom = this.systemBottom();

    if (this.loop) {
      const start = barPosition(score, this.loop.start) * barWidth - gap;
      const end = barPosition(score, this.loop.end) * barWidth - gap;
      this.strip.append(
        svg('rect', { x: start, y: top - 3 * space, width: end - start, height: bottom - top + 6 * space, fill: COLORS.loop }),
      );
    }

    const tape = tapeBars(score);
    score.bars.forEach((_, index) => {
      const x = tape.starts[index] * barWidth - gap;
      this.strip.append(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
      const number = svg('text', {
        x: x + space * 0.4,
        y: top - space * 1.2,
        fill: COLORS.barNumber,
        'font-size': space * 1.1,
        'font-family': 'system-ui, sans-serif',
      });
      number.textContent = String(barNumber(score, index));
      this.strip.append(number);
    });

    // Final bar line: a thin and a thick one.
    const end = tape.end * barWidth - gap;
    this.strip.append(
      svg('line', { x1: end - space * 0.6, x2: end - space * 0.6, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }),
      svg('line', { x1: end, x2: end, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': space * 0.4 }),
    );

    // Beams first: they decide how long the stems of their chords are.
    const stemEnds = new Map<number, number>();
    const beamLayer = svg('g');
    beamLayer.style.color = COLORS.note;
    for (const beam of this.beams) beamLayer.append(...this.drawBeam(beam, barWidth, stemEnds));

    this.chordElements = this.chords.map((chord, index) => this.drawChord(chord, barWidth, stemEnds.get(index)));
    this.strip.append(...this.chordElements, beamLayer);
    this.lastOffset = Number.NaN;
  }

  /** Where a chord's parts go, in pixels. */
  private chordGeometry(chord: StaffChord, barWidth: number) {
    const { space } = this;
    const top = chord.staff === 'treble' ? this.trebleTop() : this.bassTop();
    const yOf = (step: number) => top + (step * space) / 2;
    const headWidth = HEAD_WIDTH[chord.duration.value] * space;
    const left = chord.x * barWidth - headWidth / 2;
    const stemWidth = STEM_WIDTH * space;
    return {
      yOf,
      headWidth,
      left,
      stemWidth,
      // Up: on the heads' right side; down: on their left side.
      stemX: chord.stemUp ? left + headWidth - stemWidth / 2 : left + stemWidth / 2,
      highest: yOf(chord.notes[0].step),
      lowest: yOf(chord.notes[chord.notes.length - 1].step),
    };
  }

  /**
   * One chord as a group whose parts all paint with `currentColor`, so highlighting it
   * is a single style change on the group. A beamed chord gets its stem end from the beam
   * and no flags.
   */
  private drawChord(chord: StaffChord, barWidth: number, beamEnd?: number): SVGGElement {
    const { space } = this;
    const { value, dots } = chord.duration;
    const { yOf, headWidth, left, stemWidth, stemX, highest, lowest } = this.chordGeometry(chord, barWidth);

    const group = svg('g');
    group.style.color = COLORS.note;

    for (const step of chord.ledgerSteps) {
      const y = yOf(step);
      const extension = LEDGER_EXTENSION * space;
      group.append(
        svg('line', {
          x1: left - extension,
          x2: left + headWidth + extension,
          y1: y,
          y2: y,
          stroke: 'currentColor',
          'stroke-width': space * 0.16,
        }),
      );
    }

    for (const note of chord.notes) {
      const y = yOf(note.step);
      group.append(this.noteGlyph(NOTEHEAD[value], left, y));
      if (note.accidental) group.append(this.noteGlyph(ACCIDENTAL_GLYPH[note.accidental], left - ACCIDENTAL_OFFSET * space, y));
      // A dot goes in a space: for a note on a line, in the space just above.
      if (dots) {
        const dotStep = note.step % 2 === 0 ? note.step - 1 : note.step;
        group.append(this.noteGlyph(AUGMENTATION_DOT, left + headWidth + DOT_OFFSET * space, yOf(dotStep)));
      }
    }

    // "L.H." between the staves under a left-hand note on the treble staff, "R.H." above a
    // right-hand note on the bass staff.
    if (chord.handMark) {
      const y = chord.staff === 'treble' ? this.trebleTop() + 6.4 * space : this.bassTop() - 1.4 * space;
      const mark = svg('text', {
        x: left + headWidth / 2,
        y,
        fill: 'currentColor',
        'font-size': space * 1.3,
        'font-family': "'Times New Roman', Georgia, serif",
        'font-style': 'italic',
        'text-anchor': 'middle',
      });
      mark.textContent = this.handLabels[chord.hand];
      group.append(mark);
    }

    if (value !== 'whole') {
      const flags = flagCount(value);
      const length = (flags === 3 ? STEM_LENGTH_32ND : STEM_LENGTH) * space;
      // Up: from the lowest head past the highest one. Down: the mirror image.
      const from = chord.stemUp ? lowest - space * 0.17 : highest + space * 0.17;
      const to = beamEnd ?? (chord.stemUp ? highest - length : lowest + length);
      group.append(svg('line', { x1: stemX, x2: stemX, y1: from, y2: to, stroke: 'currentColor', 'stroke-width': stemWidth }));
      if (flags > 0 && beamEnd === undefined) {
        group.append(this.noteGlyph((chord.stemUp ? FLAG_UP : FLAG_DOWN)[flags], stemX - stemWidth / 2, to));
      }
    }
    return group;
  }

  /**
   * A beam and its extra levels (a second beam for sixteenths, a third for thirty-seconds).
   * Records where each of its chords' stems must end.
   */
  private drawBeam(beam: Beam, barWidth: number, stemEnds: Map<number, number>): SVGPolygonElement[] {
    const { space } = this;
    const chords = beam.chords.map((index) => this.chords[index]);
    const geometry = chords.map((chord) => this.chordGeometry(chord, barWidth));
    const levels = Math.max(...chords.map((chord) => flagCount(chord.duration.value)));
    const line = beamLine(
      geometry.map((g) => ({ x: g.stemX, noteY: beam.stemUp ? g.highest : g.lowest })),
      beam.stemUp,
      {
        stem: (STEM_LENGTH + Math.max(0, levels - 2) * BEAM_SPACING) * space,
        minStem: (MIN_BEAMED_STEM + (levels - 1) * BEAM_SPACING) * space,
        maxRise: BEAM_MAX_RISE * space,
      },
    );
    beam.chords.forEach((index, i) => stemEnds.set(index, beamY(line, geometry[i].stemX)));

    // Extra beams stack towards the notes: down under an up-stem beam, up over a down-stem one.
    const inward = beam.stemUp ? 1 : -1;
    const thickness = BEAM_THICKNESS * space;
    const halfStem = geometry[0].stemWidth / 2;
    const bar = (fromX: number, toX: number, level: number) => {
      const shift = inward * level * BEAM_SPACING * space;
      const y1 = beamY(line, fromX) + shift;
      const y2 = beamY(line, toX) + shift;
      const t = inward * thickness;
      return svg('polygon', {
        points: `${fromX},${y1} ${toX},${y2} ${toX},${y2 + t} ${fromX},${y1 + t}`,
        fill: 'currentColor',
      });
    };

    const shapes: SVGPolygonElement[] = [];
    const xs = geometry.map((g) => g.stemX);
    for (let level = 0; level < levels; level++) {
      // Runs of neighbouring chords short enough to need this level.
      const needs = chords.map((chord) => flagCount(chord.duration.value) > level);
      for (let i = 0; i < chords.length; i++) {
        if (!needs[i]) continue;
        let j = i;
        while (j + 1 < chords.length && needs[j + 1]) j++;
        if (j > i) {
          shapes.push(bar(xs[i] - halfStem, xs[j] + halfStem, level));
        } else {
          // A lone shorter note gets a stub pointing into the group.
          const towardsRight = i < chords.length - 1;
          const stub = BEAM_STUB * space;
          shapes.push(towardsRight ? bar(xs[i] - halfStem, xs[i] + stub, level) : bar(xs[i] - stub, xs[i] + halfStem, level));
        }
        i = j;
      }
    }
    return shapes;
  }

  /** A music glyph painted in the group's current color. */
  private noteGlyph(codepoint: string, x: number, y: number): SVGTextElement {
    const text = svg('text', { x, y, fill: 'currentColor', 'font-size': this.space * 4, 'font-family': MUSIC_FONT });
    text.textContent = codepoint;
    return text;
  }

  /** Colors the chords sounding at `position` in their hand's color, like the keys on the keyboard. */
  private highlight(position: number, isHandEnabled: (hand: Hand) => boolean): void {
    const { chords } = this;
    const active = new Set<number>();
    for (let i = firstChordFrom(chords, position - this.longestChord); i < chords.length; i++) {
      const chord = chords[i];
      if (chord.start > position) break;
      if (chord.end > position && isHandEnabled(chord.hand)) active.add(i);
    }
    for (const index of this.lit) {
      if (active.has(index)) continue;
      this.chordElements[index].style.color = COLORS.note;
      this.lit.delete(index);
    }
    for (const index of active) {
      if (this.lit.has(index)) continue;
      this.chordElements[index].style.color = COLORS.hand[chords[index].hand];
      this.lit.add(index);
    }
  }
}

/** Index of the first chord starting at or after `time` (chords are sorted by start). */
function firstChordFrom(chords: readonly StaffChord[], time: number): number {
  let lo = 0;
  let hi = chords.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].start < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
