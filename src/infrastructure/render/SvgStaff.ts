import {
  barAtBeat,
  clefAt,
  writtenBarNumber,
  writtenBeatAt,
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
import { approach } from './keyboardCamera';
import { arc, slur } from './curves';
import {
  layoutNotation,
  type Beam,
  type StaffChord,
  type StaffMark,
  type StaffRest,
  type StaffSlur,
  type Tie,
  type Tuplet,
} from './notationLayout';
import type { BarNavigation } from '../../domain/notation/navigation';
import { barPosition, beatPosition, keySignatureSteps, tapeBars, type Clef } from './staffLayout';

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
/** Smaller clefs for a change in the middle of the music. */
const G_CLEF_CHANGE = '\uE07A';
const F_CLEF_CHANGE = '\uE07C'; // (U+E07B is the C clef change)
/** A clef sits on its reference line: G on the second line from the bottom, F on the second from the top. */
const CLEF_LINE_STEP: Record<Clef, number> = { treble: 6, bass: 2 };
const CLEF_GLYPH: Record<Clef, string> = { treble: G_CLEF, bass: F_CLEF };
const CLEF_CHANGE_GLYPH: Record<Clef, string> = { treble: G_CLEF_CHANGE, bass: F_CLEF_CHANGE };
const SHARP = '\uE262';
const FLAT = '\uE260';
const NATURAL = '\uE261';
const ACCIDENTAL_GLYPH: Record<Accidental, string> = {
  sharp: SHARP,
  flat: FLAT,
  natural: NATURAL,
  'double-sharp': '\uE263',
  'double-flat': '\uE264',
};
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
const REST: Record<NoteValue, string> = {
  whole: '\uE4E3',
  half: '\uE4E4',
  quarter: '\uE4E5',
  eighth: '\uE4E6',
  sixteenth: '\uE4E7',
  thirtySecond: '\uE4E8',
};
/** Rest widths (Bravura), for centring them on their beat. */
const REST_WIDTH: Record<NoteValue, number> = {
  whole: 1.13,
  half: 1.13,
  quarter: 1.08,
  eighth: 1.0,
  sixteenth: 1.28,
  thirtySecond: 1.5,
};
/** Articulation and fermata glyphs: [above, below]. */
const MARK_GLYPHS: Record<StaffMark['kind'], [string, string]> = {
  staccato: ['\uE4A2', '\uE4A3'],
  staccatissimo: ['\uE4A8', '\uE4A9'],
  tenuto: ['\uE4A4', '\uE4A5'],
  portato: ['\uE4B2', '\uE4B3'],
  accent: ['\uE4A0', '\uE4A1'],
  marcato: ['\uE4AC', '\uE4AD'],
  fermata: ['\uE4C0', '\uE4C1'],
};
/** Slur ends sit this far beyond a notehead or a stem end. */
const SLUR_HEAD_GAP = 1.2;
const SLUR_STEM_GAP = 0.6;

/*
 * On a repeat the tape goes back. Rather than jump, it glides there: this is the glide's time
 * constant in seconds (about three of them to arrive). A move of more than half a bar in one
 * frame counts as a jump; smaller ones are ordinary playback and are followed exactly.
 */
const TAPE_GLIDE_SECONDS = 0.1;
const JUMP_THRESHOLD_BARS = 0.5;

/** Repeat barlines (with their dots), segno and coda signs. */
const REPEAT_LEFT = '\uE040';
const REPEAT_RIGHT = '\uE041';
const SEGNO = '\uE047';
const CODA = '\uE048';

/** Ties start and end this far clear of the noteheads, and this far off the note's centre. */
const TIE_GAP = 0.15;
const TIE_OFFSET = 0.6;
/** Tuplet digits 0–9 are consecutive code points from U+E880. */
const tupletDigits = (value: number) =>
  [...String(value)].map((digit) => String.fromCodePoint(0xe880 + Number(digit))).join('');
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
  /** Where the tape is drawn (it trails the target while gliding back on a repeat). */
  private shownOffset = Number.NaN;
  private gliding = false;
  private lastFrameAt = 0;
  /** Width of the left column in staff spaces, fitted to the piece's signatures. */
  private gutterSpaces = CLEF_AREA + GUTTER_END_GAP;
  /** Beat under the cursor; the left column shows the signatures in force there. */
  private currentBeat = 0;
  /** Which signatures the left column shows now; it is redrawn when they change. */
  private shownSignatures = '';
  /** The piece laid out as chords, sorted by start time, and their drawn groups (same indices). */
  private chords: StaffChord[] = [];
  private beams: Beam[] = [];
  private tuplets: Tuplet[] = [];
  private rests: StaffRest[] = [];
  private ties: Tie[] = [];
  private marks: StaffMark[] = [];
  private slurs: StaffSlur[] = [];
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
    const layout = score
      ? layoutNotation(score)
      : { chords: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [] };
    this.chords = [...layout.chords];
    this.beams = [...layout.beams];
    this.tuplets = [...layout.tuplets];
    this.rests = [...layout.rests];
    this.ties = [...layout.ties];
    this.marks = [...layout.marks];
    this.slurs = [...layout.slurs];
    this.longestChord = this.chords.reduce((max, chord) => Math.max(max, chord.beats), 0);
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
      this.currentBeat = writtenBeatAt(this.score, position);
      if (this.signaturesKey() !== this.shownSignatures) this.drawBackground();
      this.highlight(this.currentBeat, isHandEnabled);
    }
    const x = this.score ? barPosition(this.score, position) * this.barWidth() : 0;
    const target = this.cursorX() - x;

    // Follow the music exactly; but when the target leaps (a repeat, a jump, a seek), glide to it.
    const now = performance.now();
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.lastFrameAt = now;
    if (Number.isNaN(this.shownOffset)) this.shownOffset = target;
    if (Math.abs(target - this.shownOffset) > JUMP_THRESHOLD_BARS * this.barWidth()) this.gliding = true;
    if (this.gliding) {
      this.shownOffset = approach(this.shownOffset, target, dt, TAPE_GLIDE_SECONDS);
      if (this.shownOffset === target) this.gliding = false;
    } else {
      this.shownOffset = target;
    }

    const offset = Math.round(this.shownOffset * 10) / 10;
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

  /** The clefs in force under the cursor on the upper and lower staff. */
  private currentClefs(): [Clef, Clef] {
    const score = this.score;
    if (!score) return ['treble', 'bass'];
    return [clefAt(score, 1, this.currentBeat), clefAt(score, 2, this.currentBeat)];
  }

  private signaturesKey(): string {
    const current = this.currentSignatures();
    const clefs = this.currentClefs().join('/');
    return current ? `${clefs} ${current.key.fifths} ${current.time.numerator}/${current.time.denominator}` : clefs;
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

    // The clefs in force under the cursor; usually treble above and bass below.
    const [upper, lower] = this.currentClefs();
    this.background.append(
      this.glyph(CLEF_GLYPH[upper], space * 1.2, this.trebleTop() + (CLEF_LINE_STEP[upper] * space) / 2),
      this.glyph(CLEF_GLYPH[lower], space * 1.2, this.bassTop() + (CLEF_LINE_STEP[lower] * space) / 2),
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
    const [upper, lower] = this.currentClefs();
    const staves: [Clef, number][] = [
      [upper, this.trebleTop()],
      [lower, this.bassTop()],
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
    score.writtenBarBeats.forEach((_, index) => {
      const x = tape.starts[index] * barWidth - gap;
      this.strip.append(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
      const number = svg('text', {
        x: x + space * 0.4,
        y: top - space * 1.2,
        fill: COLORS.barNumber,
        'font-size': space * 1.1,
        'font-family': 'system-ui, sans-serif',
      });
      number.textContent = String(writtenBarNumber(score, index));
      this.strip.append(number);
    });

    this.strip.append(...this.drawNavigation(score.navigation, tape, barWidth, gap));

    // Final bar line: a thin and a thick one.
    const end = tape.end * barWidth - gap;
    this.strip.append(
      svg('line', { x1: end - space * 0.6, x2: end - space * 0.6, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }),
      svg('line', { x1: end, x2: end, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': space * 0.4 }),
    );

    // Clef changes in the middle of the music: a small clef just before the first note it applies to.
    for (const change of score.clefs) {
      if (change.beat <= 1e-9) continue; // the opening clefs live in the left column
      const bar = barAtBeat(score, change.beat);
      const staffTop = change.staff === 1 ? top : this.bassTop();
      const x = beatPosition(score, bar, change.beat) * barWidth - 2.6 * space;
      this.strip.append(
        svg('text', {
          x,
          y: staffTop + (CLEF_LINE_STEP[change.clef] * space) / 2,
          fill: COLORS.clef,
          'font-size': space * 4,
          'font-family': MUSIC_FONT,
        }),
      );
      (this.strip.lastChild as SVGTextElement).textContent = CLEF_CHANGE_GLYPH[change.clef];
    }

    // Beams first: they decide how long the stems of their chords are.
    const stemEnds = new Map<number, number>();
    const beamLayer = svg('g');
    beamLayer.style.color = COLORS.note;
    for (const beam of this.beams) beamLayer.append(...this.drawBeam(beam, barWidth, stemEnds));
    for (const tuplet of this.tuplets) {
      if (tuplet.showNumber || tuplet.bracket) beamLayer.append(...this.drawTuplet(tuplet, barWidth, stemEnds));
    }

    this.chordElements = this.chords.map((chord, index) => this.drawChord(chord, barWidth, stemEnds.get(index)));
    // A tie belongs to the chord it starts from, so it lights up with it; so do the chord's marks.
    for (const tie of this.ties) this.chordElements[tie.from].append(this.drawTie(tie, barWidth));
    for (const mark of this.marks) this.chordElements[mark.chord].append(this.drawMark(mark, barWidth));
    // A slur spans a phrase, so it stays in the ink colour with the beams.
    for (const phrase of this.slurs) beamLayer.append(this.drawSlur(phrase, barWidth, stemEnds));

    const restLayer = svg('g');
    restLayer.style.color = COLORS.note;
    for (const rest of this.rests) restLayer.append(...this.drawRest(rest, barWidth));

    this.strip.append(restLayer, ...this.chordElements, beamLayer);
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

  /**
   * A tuplet's number (and bracket, if it has one) beyond the stems on their side: over a beam,
   * or over the notes of an unbeamed group.
   */
  private drawTuplet(tuplet: Tuplet, barWidth: number, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const chords = tuplet.chords.map((index) => this.chords[index]);
    const geometry = chords.map((chord) => this.chordGeometry(chord, barWidth));
    // The outermost point of each chord on the tuplet's side: its stem end, or the notehead.
    const outer = tuplet.chords.map((index, i) => {
      const g = geometry[i];
      const stemmed = chords[i].duration.value !== 'whole' && chords[i].stemUp === tuplet.above;
      if (!stemmed) return tuplet.above ? g.highest - space : g.lowest + space;
      return stemEnds.get(index) ?? (tuplet.above ? g.highest - STEM_LENGTH * space : g.lowest + STEM_LENGTH * space);
    });
    const left = geometry[0].left;
    const right = geometry[geometry.length - 1].left + geometry[geometry.length - 1].headWidth;
    const center = (left + right) / 2;
    const direction = tuplet.above ? -1 : 1;
    // The line the number and bracket sit on, a little clear of the stems.
    const y = (tuplet.above ? Math.min(...outer) : Math.max(...outer)) + direction * 1.4 * space;

    const shapes: SVGElement[] = [];
    if (tuplet.showNumber) {
      const number = svg('text', {
        x: center,
        y: y + space * 0.75, // tuplet digits are about a space and a half tall
        fill: 'currentColor',
        'font-size': space * 3.4,
        'font-family': MUSIC_FONT,
        'text-anchor': 'middle',
      });
      number.textContent = tupletDigits(tuplet.number);
      shapes.push(number);
    }
    if (tuplet.bracket) {
      const gap = tuplet.showNumber ? space * 1.1 : 0;
      const hook = -direction * space * 0.8; // hooks point towards the notes
      const line = { stroke: 'currentColor', 'stroke-width': space * 0.12, fill: 'none' };
      shapes.push(
        svg('polyline', { points: `${left},${y + hook} ${left},${y} ${center - gap},${y}`, ...line }),
        svg('polyline', { points: `${center + gap},${y} ${right},${y} ${right},${y + hook}`, ...line }),
      );
    }
    return shapes;
  }

  /**
   * Repeat signs at bar lines, volta brackets over the treble staff, segno and coda signs, and
   * the words of jumps ("D.C. al Fine", "To Coda") over the ends of their bars.
   */
  private drawNavigation(
    navigation: readonly BarNavigation[],
    tape: { starts: readonly number[]; widths: readonly number[] },
    barWidth: number,
    gap: number,
  ): SVGElement[] {
    const { space } = this;
    const shapes: SVGElement[] = [];
    const staves = [this.trebleTop(), this.bassTop()];
    const barStart = (i: number) => tape.starts[i] * barWidth - gap;
    const barEnd = (i: number) => (tape.starts[i] + tape.widths[i]) * barWidth - gap;
    const top = this.trebleTop();
    const ink = (element: SVGElement) => {
      element.style.setProperty('fill', COLORS.note);
      return element;
    };
    const glyph = (codepoint: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'start') => {
      const text = this.noteGlyph(codepoint, x, y);
      text.setAttribute('text-anchor', anchor);
      return ink(text);
    };

    navigation.forEach((nav, i) => {
      // The repeat glyphs include their thick and thin lines and dots, one staff tall.
      for (const staffTop of staves) {
        if (nav.repeatStart) shapes.push(glyph(REPEAT_LEFT, barStart(i), staffTop + 4 * space));
        if (nav.repeatEnd) shapes.push(glyph(REPEAT_RIGHT, barEnd(i), staffTop + 4 * space, 'end'));
      }
      if (nav.segnoSign) shapes.push(glyph(SEGNO, barStart(i) + space, top - 2.6 * space));
      if (nav.codaSign) shapes.push(glyph(CODA, barStart(i) + space, top - 2.6 * space));
      if (nav.text) {
        const words = svg('text', {
          x: barEnd(i) - space * 0.5,
          y: top - 3.4 * space,
          'font-size': space * 1.3,
          'font-family': "'Times New Roman', Georgia, serif",
          'font-style': 'italic',
          'font-weight': 'bold',
          'text-anchor': 'end',
        });
        words.textContent = nav.text;
        shapes.push(ink(words));
      }

      // A volta: a bracket from the first bar of its ending to the last, with its label.
      if (nav.endingLabel) {
        let last = i;
        while (last + 1 < navigation.length && navigation[last + 1].ending && !navigation[last + 1].endingLabel) last++;
        const y = top - 4.6 * space;
        const hook = 1.6 * space;
        const left = barStart(i) + 0.3 * space;
        const right = barEnd(last) - 0.3 * space;
        const closed = navigation[last].endingClosed;
        const line = svg('polyline', {
          points: `${left},${y + hook} ${left},${y} ${right},${y}${closed ? ` ${right},${y + hook}` : ''}`,
          fill: 'none',
          'stroke-width': space * 0.12,
        });
        line.style.setProperty('stroke', COLORS.note);
        const label = svg('text', {
          x: left + 0.5 * space,
          y: y + 1.4 * space,
          'font-size': space * 1.3,
          'font-family': 'system-ui, sans-serif',
          'font-weight': 'bold',
        });
        label.textContent = nav.endingLabel;
        shapes.push(line, ink(label));
      }
    });
    return shapes;
  }

  /** A rest glyph (with its dot), centred on its beat. */
  private drawRest(rest: StaffRest, barWidth: number): SVGTextElement[] {
    const { space } = this;
    const top = rest.staff === 'treble' ? this.trebleTop() : this.bassTop();
    const { value, dots } = rest.duration;
    const width = REST_WIDTH[value] * space;
    const left = rest.x * barWidth - width / 2;
    const y = top + (rest.step * space) / 2;
    const glyphs = [this.noteGlyph(REST[value], left, y)];
    if (dots) glyphs.push(this.noteGlyph(AUGMENTATION_DOT, left + width + DOT_OFFSET * space, top + 1.5 * space));
    return glyphs;
  }

  /** An articulation or fermata, centred over (or under) the notehead. */
  private drawMark(mark: StaffMark, barWidth: number): SVGTextElement {
    const { yOf, left, headWidth } = this.chordGeometry(this.chords[mark.chord], barWidth);
    const [above, below] = MARK_GLYPHS[mark.kind];
    const glyph = this.noteGlyph(mark.above ? above : below, left + headWidth / 2, yOf(mark.step));
    glyph.setAttribute('text-anchor', 'middle');
    return glyph;
  }

  /**
   * A phrasing slur. Each end sits just beyond its notehead, or beyond the stem end when the slur
   * is on the stem side; the curve then rises (or sinks) to clear every chord in between.
   */
  private drawSlur(phrase: StaffSlur, barWidth: number, stemEnds: Map<number, number>): SVGPathElement {
    const { space } = this;
    const direction = phrase.above ? -1 : 1;
    const outerPoint = (index: number) => {
      const chord = this.chords[index];
      const g = this.chordGeometry(chord, barWidth);
      const stemmed = chord.duration.value !== 'whole';
      if (stemmed && chord.stemUp === phrase.above) {
        const stemEnd =
          stemEnds.get(index) ?? (chord.stemUp ? g.highest - STEM_LENGTH * space : g.lowest + STEM_LENGTH * space);
        return { x: g.stemX, y: stemEnd + direction * SLUR_STEM_GAP * space };
      }
      return { x: g.left + g.headWidth / 2, y: (phrase.above ? g.highest : g.lowest) + direction * SLUR_HEAD_GAP * space };
    };
    const start = outerPoint(phrase.from);
    const end = outerPoint(phrase.to);
    const shape = slur({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      above: phrase.above,
      space,
      obstacles: phrase.between.map(outerPoint),
    });
    return svg('path', { d: shape.path, fill: 'currentColor' });
  }

  /** A tie: a crescent from one notehead to the next, curving away from the stems. */
  private drawTie(tie: Tie, barWidth: number): SVGPathElement {
    const { space } = this;
    const from = this.chordGeometry(this.chords[tie.from], barWidth);
    const to = this.chordGeometry(this.chords[tie.to], barWidth);
    const y = from.yOf(tie.step) + (tie.above ? -1 : 1) * TIE_OFFSET * space;
    const shape = arc({
      x1: from.left + from.headWidth + TIE_GAP * space,
      x2: to.left - TIE_GAP * space,
      y,
      above: tie.above,
      space,
    });
    return svg('path', { d: shape.path, fill: 'currentColor' });
  }

  /** A music glyph painted in the group's current color. */
  private noteGlyph(codepoint: string, x: number, y: number): SVGTextElement {
    const text = svg('text', { x, y, fill: 'currentColor', 'font-size': this.space * 4, 'font-family': MUSIC_FONT });
    text.textContent = codepoint;
    return text;
  }

  /**
   * Colors the chords sounding at `beat` (along the page) in their hand's color, like the keys on
   * the keyboard. Working along the page means a repeated bar lights up again on every pass.
   */
  private highlight(beat: number, isHandEnabled: (hand: Hand) => boolean): void {
    const { chords } = this;
    const active = new Set<number>();
    for (let i = firstChordFrom(chords, beat - this.longestChord); i < chords.length; i++) {
      const chord = chords[i];
      if (chord.beat > beat + 1e-9) break;
      if (chord.beat + chord.beats > beat + 1e-9 && isHandEnabled(chord.hand)) active.add(i);
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

/** Index of the first chord starting at or after `beat` (chords are sorted by beat). */
function firstChordFrom(chords: readonly StaffChord[], beat: number): number {
  let lo = 0;
  let hi = chords.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].beat < beat) lo = mid + 1;
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
