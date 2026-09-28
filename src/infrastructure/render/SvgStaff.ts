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
import { avoidNotes, beamLine, beamY, kneeBeamLine, type BeamObstacle } from './beams';
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
  type StaffOctaveShift,
  type Tuplet,
} from './notationLayout';
import type { BarNavigation } from '../../domain/notation/navigation';
import { layoutPedal } from './pedalLayout';
import {
  barPosition,
  beatPosition,
  cancelledSteps,
  keySignatureSteps,
  pageAt,
  signatureChanges,
  tapeBars,
  type Clef,
  type SignatureChange,
} from './staffLayout';

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
/**
 * A beam keeps this far from another voice's notes, and may shorten its stems down to
 * SHORTEST_BEAMED_STEM to do so before it moves past them instead.
 */
const BEAM_CLEARANCE = 0.4;
const SHORTEST_BEAMED_STEM = 2;
/** Stems of a beam across both staves may be this short: the gap between the staves is narrow. */
const SHORTEST_KNEED_STEM = 1.2;
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
 * When the tape leaps (back on a repeat, over the room of a key or time change), it glides there
 * rather than jumps: this is the glide's time constant in seconds (about three of them to arrive).
 * A move of more than JUMP_THRESHOLD_SPACES in one frame counts as a leap; smaller ones are
 * ordinary playback and are followed exactly.
 */
const TAPE_GLIDE_SECONDS = 0.1;
const JUMP_THRESHOLD_SPACES = 2;
/**
 * After the tape is dragged by hand it stays put for this long (of playing time) before it goes
 * back to the music, as the falling notes' keyboard does. A position change bigger than
 * SEEK_THRESHOLD_SECONDS between frames is a seek, which brings it back at once.
 */
const MANUAL_HOLD_SECONDS = 3;
const SEEK_THRESHOLD_SECONDS = 0.5;

/**
 * Bar numbers: this far right of the bar line and over the top line, clear of notes by this much;
 * and how wide two digits are, in staff spaces.
 */
const BAR_NUMBER_INSET = 0.4;
const BAR_NUMBER_RISE = 1.2;
const BAR_NUMBER_CLEARANCE = 0.6;
const BAR_NUMBER_WIDTH = 1.6;
/** A volta bracket's line stays this far above a bar number's baseline (its label hangs below the line). */
const VOLTA_OVER_NUMBER = 2.6;

/**
 * Room for repeat signs, in staff spaces: the ‖: and :‖ glyphs are REPEAT_GLYPH_WIDTH wide and
 * stand on the bar line, so a ‖: gets room before the bar's first note, a :‖ after its last note.
 */
const REPEAT_GLYPH_WIDTH = 1.5;
const REPEAT_LEAD = 1.6;
const REPEAT_TAIL = 2.2;

/** Repeat barlines (with their dots), segno and coda signs. */
const REPEAT_LEFT = '\uE040';
const REPEAT_RIGHT = '\uE041';
const SEGNO = '\uE047';
const CODA = '\uE048';

/** Pedal signs ("Ped." and "✱") and the bracket line, under the lower staff. */
const PEDAL_PRESS = '\uE650';
const PEDAL_RELEASE = '\uE655';
/** "Sost.": the middle pedal. */
const PEDAL_SOSTENUTO = '\uE659';
/**
 * How far below the bottom line of the lower staff the pedal marks sit (their baseline), and how
 * far below low notes, stems and marks when those reach further down ("Ped." is 2 spaces tall).
 */
const PEDAL_DROP = 3.8;
const PEDAL_CLEARANCE = 2.6;
/** An articulation or fermata under a note reaches about this far below its reference line. */
const MARK_DEPTH = 1.5;
/**
 * Width of the "Ped." glyph, where a line after it starts. The "✱" is centred this far before its
 * beat: a release on a bar line goes before the line (bar lines stand BAR_LINE_GAP before the beat).
 */
const PEDAL_PRESS_WIDTH = 4.1;
const PEDAL_SOSTENUTO_WIDTH = 4.4;
/** Where the middle pedal's line overlaps the right pedal's marks, it goes this much lower. */
const PEDAL_ROW = 2.4;
const PEDAL_RELEASE_BEFORE = 2.2;
/** Bracket hooks and change notches: height, and half the width of a notch. */
const PEDAL_HOOK = 1.2;
const PEDAL_NOTCH = 0.5;
/** A line ends this far before its release beat: before the bar line (even the final double one) when released on one. */
const PEDAL_LINE_GAP = 2.4;

/*
 * A key or time change inside the music gets room before the bar's first note: a gap after the bar
 * line, the cancelling naturals, the new key, the new time signature, and a gap before the note.
 */
const CHANGE_GAP_BEFORE = 0.8;
const CHANGE_GAP_AFTER = 0.4;
const NATURAL_ADVANCE = 1.0;

/**
 * Metronome marks: a small note (SMuFL metronome glyphs, at this share of the music font size) and
 * "= 90", this far over the top line of the treble staff.
 */
const TEMPO_MARK_RISE = 3.4;

/**
 * Octave shift brackets: "8va" (15ma, 22ma) and a dashed line over the notes it covers, with a
 * hook at the end towards the staff; "8vb" (15mb, 22mb) the same under them.
 */
const OCTAVE_GLYPH_ABOVE = ['\uE511', '\uE515', '\uE518'];
const OCTAVE_GLYPH_BELOW = ['\uE51C', '\uE51D', '\uE51E'];
/** Widths of those glyphs at the music font size, in staff spaces (the line starts after them). */
const OCTAVE_GLYPH_WIDTH_ABOVE = 3.6;
const OCTAVE_GLYPH_WIDTH_BELOW = 3.2;
/** A metronome mark over an 8va bracket goes this far above the bracket's baseline. */
const TEMPO_OVER_OCTAVE = 3.2;
/** Clearance from the staff and from the notes, and the height of the dashed line above the baseline. */
const OCTAVE_CLEARANCE = 2.2;
const OCTAVE_LINE_RISE = 0.8;
const OCTAVE_HOOK = 1.0;
/** How far an octave glyph reaches below its baseline. */
const OCTAVE_BRACKET_DEPTH = 0.4;

/**
 * Dynamics: marks (SMuFL letters p, m, f, r, s, z, n combined), words (cresc., dim.) and hairpins,
 * between the staves (or under the lower one); their baseline sits DYNAMICS_DROP below the upper
 * staff, lower where notes of the upper staff reach down, by DYNAMICS_CLEARANCE.
 */
const DYNAMIC_LETTERS: Readonly<Record<string, string>> = {
  p: '\uE520',
  m: '\uE521',
  f: '\uE522',
  r: '\uE523',
  s: '\uE524',
  z: '\uE525',
  n: '\uE526',
};
const DYNAMICS_DROP = 4;
const DYNAMICS_CLEARANCE = 2;
/** How far a mark (or a hairpin's lower line) reaches below its baseline, plus a little air. */
const DYNAMICS_BELOW_LINE = 0.6;
/** Width of one dynamic letter, roughly (spaces): a hairpin starting at a mark begins after it. */
const DYNAMIC_LETTER_WIDTH = 1.3;
/** Half the opening of a hairpin, and how far above the dynamics baseline its middle is. */
const HAIRPIN_OPENING = 0.6;
const HAIRPIN_RISE = 0.7;
/** "una corda" / "tre corde": this far under the upper staff, above the dynamics. */
const SOFT_PEDAL_DROP = 1.8;
const SOFT_PEDAL_INSET = 0.8;
const TEMPO_NOTE_SIZE = 2.6;
const TEMPO_NOTE_WIDTH = 1.3;
const TEMPO_DOT_WIDTH = 0.3;
const METRONOME_NOTE: Record<NoteValue, string> = {
  whole: '\uE1D2',
  half: '\uE1D3',
  quarter: '\uE1D5',
  eighth: '\uE1D7',
  sixteenth: '\uE1D9',
  thirtySecond: '\uE1DB',
};
const METRONOME_DOT = '\uE1E7';

/** A click within this many staff spaces of a notehead's centre means that note. */
const NOTE_SNAP = 1.2;

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
  /** How far the tape trails the music while gliding to it (pixels); 0 when following exactly. */
  private lag = 0;
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
  private octaveShifts: StaffOctaveShift[] = [];
  /** Dynamics drawn under the lower staff (their baselines), for the pedal marks to clear. */
  private dynamicsBelow: { left: number; right: number; y: number }[] = [];
  /** Where each bar number was drawn (its baseline), for volta brackets to clear. */
  private barNumberY: number[] = [];
  /**
   * Where octave brackets were drawn (their baselines): 8va over the treble staff, for tempo marks
   * to clear, and 8vb under the bass staff, for the pedal marks to clear.
   */
  private octaveBrackets: { staff: Clef; above: boolean; left: number; right: number; y: number }[] = [];
  private chordElements: SVGGElement[] = [];
  private longestChord = 0;
  /** Chords currently highlighted in their hand's color. */
  private readonly lit = new Set<number>();
  /** Hand marks for notes written on the other hand's staff ("L.H." / "л. р."), in the UI language. */
  private handLabels: Record<Hand, string> = { right: 'R.H.', left: 'L.H.' };
  /** Behind the music on the tape: the printed bar under the pointer, and bars being selected by dragging. */
  private readonly overlay: SVGGElement = svg('g');
  private hoverBar: number | null = null;
  /**
   * Key and time changes along the page. Room on the tape, in staff spaces, for what is printed at
   * bar lines: `lead[i]` between bar i's line and its first note (a ‖:, a key or time change),
   * `tail[i]` between its last note and the next line (a :‖). `roomBefore[i]` adds up all the room
   * before bar i's line.
   */
  private changes: SignatureChange[] = [];
  private lead: number[] = [];
  private tail: number[] = [];
  private roomBefore: number[] = [0];
  /** The tape dragged by hand (see dragBy), or null while it follows the music. */
  private manual: { offset: number; idle: number } | null = null;
  private lastPosition = 0;
  private lastCursorLeft = Number.NaN;
  private selection: { from: number; to: number } | null = null;

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
      : { chords: [], octaveShifts: [], beams: [], tuplets: [], rests: [], ties: [], marks: [], slurs: [] };
    this.chords = [...layout.chords];
    this.beams = [...layout.beams];
    this.tuplets = [...layout.tuplets];
    this.rests = [...layout.rests];
    this.ties = [...layout.ties];
    this.marks = [...layout.marks];
    this.slurs = [...layout.slurs];
    this.octaveShifts = [...layout.octaveShifts];
    this.longestChord = this.chords.reduce((max, chord) => Math.max(max, chord.beats), 0);
    this.changes = score ? signatureChanges(score) : [];
    const navigation = score?.navigation ?? [];
    this.lead = (score?.writtenBarBeats ?? []).map((_, i) => (navigation[i]?.repeatStart ? REPEAT_LEAD : 0));
    this.tail = (score?.writtenBarBeats ?? []).map((_, i) => (navigation[i]?.repeatEnd ? REPEAT_TAIL : 0));
    for (const change of this.changes) this.lead[change.bar] += signatureChangeWidth(change);
    this.roomBefore = [0];
    this.lead.forEach((lead, i) => this.roomBefore.push(this.roomBefore[i] + lead + this.tail[i]));
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

  /**
   * The place on the page under the pointer: the printed bar, and the beat there. A click just
   * beside a notehead means that note, so it snaps to the note's beat (otherwise playback would
   * start a moment after the note is struck). Null outside the tape.
   */
  pageAt(clientX: number): { bar: number; beat: number } | null {
    const score = this.score;
    if (!score || score.notes.length === 0) return null;
    const offset = Number.isNaN(this.lastOffset) ? 0 : this.lastOffset;
    const px = clientX - this.tapeSvg.getBoundingClientRect().left - offset;
    const place = pageAt(score, ...this.fromPx(px));
    if (!place) return null;
    let nearest: StaffChord | null = null;
    for (const chord of this.chords) {
      const distance = Math.abs(this.px(chord.x) - px);
      if (distance <= NOTE_SNAP * this.space && (!nearest || distance < Math.abs(this.px(nearest.x) - px))) nearest = chord;
    }
    return nearest && barAtBeat(score, nearest.beat) === place.bar ? { bar: place.bar, beat: nearest.beat } : place;
  }

  /** Lightly shades the printed bar under the pointer (null: none). */
  setHover(bar: number | null): void {
    if (bar === this.hoverBar) return;
    this.hoverBar = bar;
    this.drawOverlay();
  }

  /** Shades printed bars `from..to` in the loop colour while they are being dragged over (null: none). */
  setSelection(selection: { from: number; to: number } | null): void {
    this.selection = selection;
    this.drawOverlay();
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
  render(position: number, isHandEnabled: (hand: Hand) => boolean = () => true, playing = false): void {
    if (this.score) {
      this.currentBeat = writtenBeatAt(this.score, position);
      if (this.signaturesKey() !== this.shownSignatures) this.drawBackground();
      this.highlight(this.currentBeat, isHandEnabled);
    }
    const x = this.score ? this.px(barPosition(this.score, position)) : 0;
    const target = this.cursorX() - x;

    const now = performance.now();
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.lastFrameAt = now;
    if (Number.isNaN(this.shownOffset)) this.shownOffset = target;

    // Dragged by hand: the tape stays where it was put; after a while of playing it goes back to the
    // music. A seek (a click, the arrows) goes back at once.
    const seeked = Math.abs(position - this.lastPosition) > SEEK_THRESHOLD_SECONDS;
    this.lastPosition = position;
    if (this.manual && (seeked || (playing && (this.manual.idle += dt) >= MANUAL_HOLD_SECONDS))) this.manual = null;

    if (this.manual) {
      this.shownOffset = this.manual.offset;
      this.lag = 0;
    } else {
      // Follow the music exactly; but when the target leaps (a repeat, a jump, a seek, the end of
      // a drag), glide to it. The glide shrinks the distance to the music rather than chasing it:
      // the music keeps moving, and a glide towards a moving target would never quite arrive.
      const distance = this.shownOffset - target;
      if (Math.abs(distance - this.lag) > JUMP_THRESHOLD_SPACES * this.space) this.lag = distance;
      this.lag = approach(this.lag, 0, dt, TAPE_GLIDE_SECONDS);
      this.shownOffset = target + this.lag;
    }

    // The cursor marks the music on the tape: it stands still, unless the tape is moved away from it.
    const cursorX = this.manual ? x + this.shownOffset : this.cursorX();
    const cursorLeft = Math.round((this.gutterWidth() + cursorX - 1) * 10) / 10;
    if (cursorLeft !== this.lastCursorLeft) {
      this.lastCursorLeft = cursorLeft;
      this.cursor.style.left = `${cursorLeft}px`;
      this.cursor.style.visibility = cursorX < 0 || cursorX > this.width - this.gutterWidth() ? 'hidden' : 'visible';
    }

    const offset = Math.round(this.shownOffset * 10) / 10;
    if (offset === this.lastOffset) return;
    this.lastOffset = offset;
    this.strip.setAttribute('transform', `translate(${offset} 0)`);
  }

  /**
   * Moves the tape by `dx` pixels by hand (to the right: back in the music). The music plays on;
   * after a while of playing the tape goes back to it, like a keyboard scrolled by hand.
   */
  dragBy(dx: number): void {
    const score = this.score;
    if (!score || score.notes.length === 0) return;
    const current = this.manual?.offset ?? this.shownOffset;
    // Keep some of the music in sight: the cursor's place stays between the first and the last bar.
    const lowest = this.cursorX() - this.px(tapeBars(score).end);
    this.manual = { offset: Math.min(this.cursorX(), Math.max(lowest, current + dx)), idle: 0 };
  }

  /** Back to following the music (after a jump): the tape glides to it. */
  followMusic(): void {
    this.manual = null;
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

  /**
   * Pixels along the tape for `x` in bar units (a full bar is 1). Bars with a key or time change
   * have room for it before their first note, so everything after them moves right by that much.
   */
  private px(x: number): number {
    const score = this.score;
    if (!score) return x * this.barWidth();
    const bar = tapeBarAt(tapeBars(score).starts, x);
    return x * this.barWidth() + ((this.roomBefore[bar] ?? 0) + (this.lead[bar] ?? 0)) * this.space;
  }

  /** The inverse of px, for finding what is under the pointer: [x for the bar lookup, x for the beat]. */
  private fromPx(px: number): [number, number] {
    const score = this.score;
    if (!score) return [px / this.barWidth(), px / this.barWidth()];
    const bars = tapeBars(score).starts.length;
    // The bar whose bar line is at or before the pointer.
    let bar = 0;
    while (bar + 1 < bars && this.barLineX(bar + 1) <= px) bar++;
    const x = (px - ((this.roomBefore[bar] ?? 0) + (this.lead[bar] ?? 0)) * this.space) / this.barWidth();
    return [tapeBars(score).starts[bar] + (px < this.barLineX(0) ? -1 : 0), x];
  }

  /** Where bar `index`'s bar line is drawn (index = the number of bars: the final bar line). */
  private barLineX(index: number): number {
    const score = this.score;
    if (!score) return 0;
    const tape = tapeBars(score);
    const x = index < tape.starts.length ? tape.starts[index] : tape.end;
    return x * this.barWidth() + (this.roomBefore[index] ?? this.roomBefore[this.roomBefore.length - 1]) * this.space - BAR_LINE_GAP * this.space;
  }

  /** An edge of a stretch of music (a loop) at `x` in bar units: at a bar start, that bar's line. */
  private edgeX(x: number): number {
    const score = this.score;
    if (!score) return 0;
    const starts = tapeBars(score).starts;
    const bar = tapeBarAt(starts, x);
    return Math.abs(starts[bar] - x) < 1e-6 ? this.barLineX(bar) : this.px(x) - BAR_LINE_GAP * this.space;
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
    // Its left is set by render(): it moves with the tape when the tape is dragged away.
    Object.assign(this.cursor.style, {
      left: `${gutter + this.cursorX() - 1}px`,
      top: `${this.trebleTop() - 2 * space}px`,
      height: `${(this.systemBottom() - this.trebleTop()) + 4 * space}px`,
    });
    this.lastOffset = Number.NaN;
    this.lastCursorLeft = Number.NaN;
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

  /** The hovered bar (faint) and the bars being selected (in the loop colour), behind the music. */
  private drawOverlay(): void {
    this.overlay.replaceChildren();
    const score = this.score;
    if (!score || score.notes.length === 0) return;
    const { space } = this;
    const tape = tapeBars(score);
    const top = this.trebleTop() - 3 * space;
    const height = this.systemBottom() - this.trebleTop() + 6 * space;
    const shade = (from: number, to: number, fill: string, opacity: number) => {
      const x = this.barLineX(from);
      const end = this.barLineX(to + 1);
      const rect = svg('rect', { x, y: top, width: end - x, height, fill });
      rect.style.opacity = String(opacity);
      this.overlay.append(rect);
    };
    if (this.selection) {
      const { from, to } = this.selection;
      shade(Math.min(from, to), Math.max(from, to), COLORS.loop, 1);
    } else if (this.hoverBar !== null && this.hoverBar < tape.starts.length) {
      shade(this.hoverBar, this.hoverBar, COLORS.loop, 0.5);
    }
  }

  private drawStrip(): void {
    this.strip.replaceChildren();
    this.lit.clear();
    this.chordElements = [];
    const score = this.score;
    if (!score || score.notes.length === 0) return;

    const { space } = this;
    const top = this.trebleTop();
    const bottom = this.systemBottom();

    this.strip.append(this.overlay);
    this.drawOverlay();

    if (this.loop) {
      const start = this.edgeX(barPosition(score, this.loop.start));
      // The end of the loop's last bar: the next bar played may be printed earlier (a repeat).
      const end = this.edgeX(barPosition(score, Math.max(this.loop.start, this.loop.end - 1e-6)));
      this.strip.append(
        svg('rect', { x: start, y: top - 3 * space, width: Math.max(0, end - start), height: bottom - top + 6 * space, fill: COLORS.loop }),
      );
    }

    const tape = tapeBars(score);
    score.writtenBarBeats.forEach((_, index) => {
      const x = this.barLineX(index);
      this.strip.append(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
    });

    this.strip.append(...this.drawSignatureChanges(score));

    // Final bar line: a thin and a thick one.
    const end = this.barLineX(tape.starts.length);
    this.strip.append(
      svg('line', { x1: end - space * 0.6, x2: end - space * 0.6, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }),
      svg('line', { x1: end, x2: end, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': space * 0.4 }),
    );

    // Clef changes in the middle of the music: a small clef just before the first note it applies to.
    for (const change of score.clefs) {
      if (change.beat <= 1e-9) continue; // the opening clefs live in the left column
      const bar = barAtBeat(score, change.beat);
      const staffTop = change.staff === 1 ? top : this.bassTop();
      const x = this.px(beatPosition(score, bar, change.beat)) - 2.6 * space;
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
    for (const beam of this.beams) beamLayer.append(...this.drawBeam(beam, stemEnds));
    for (const tuplet of this.tuplets) {
      if (tuplet.showNumber || tuplet.bracket) beamLayer.append(...this.drawTuplet(tuplet, stemEnds));
    }

    this.chordElements = this.chords.map((chord, index) => this.drawChord(chord, stemEnds.get(index)));
    // A tie belongs to the chord it starts from, so it lights up with it; so do the chord's marks.
    for (const tie of this.ties) this.chordElements[tie.from].append(this.drawTie(tie));
    for (const mark of this.marks) this.chordElements[mark.chord].append(this.drawMark(mark));
    // A slur spans a phrase, so it stays in the ink colour with the beams.
    for (const phrase of this.slurs) beamLayer.append(this.drawSlur(phrase, stemEnds));

    const restLayer = svg('g');
    restLayer.style.color = COLORS.note;
    for (const rest of this.rests) restLayer.append(...this.drawRest(rest));
    // Bar numbers clear the notes, and volta brackets clear the bar numbers.
    restLayer.append(...this.drawBarNumbers(score, stemEnds), ...this.drawNavigation(score.navigation));
    // Octave brackets first: the tempo marks go over the 8va ones, the pedal under the 8vb ones.
    this.octaveBrackets = [];
    for (const shift of this.octaveShifts) restLayer.append(...this.drawOctaveShift(shift, stemEnds));
    // Dynamics before the pedal: those pushed under the lower staff, the pedal goes under.
    this.dynamicsBelow = [];
    const dynamics = this.drawDynamics(score, stemEnds);
    restLayer.append(...this.drawPedal(score, stemEnds), ...dynamics);
    restLayer.append(...this.drawTempoMarks(score));

    this.strip.append(restLayer, ...this.chordElements, beamLayer);
    this.lastOffset = Number.NaN;
  }

  /** Where a chord's parts go, in pixels. */
  private chordGeometry(chord: StaffChord) {
    const { space } = this;
    const top = chord.staff === 'treble' ? this.trebleTop() : this.bassTop();
    const yOf = (step: number) => top + (step * space) / 2;
    const headWidth = HEAD_WIDTH[chord.duration.value] * space;
    const left = this.px(chord.x) - headWidth / 2 + (chord.voiceShift ? headWidth : 0);
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
  private drawChord(chord: StaffChord, beamEnd?: number): SVGGElement {
    const { space } = this;
    const { value, dots } = chord.duration;
    const { yOf, headWidth, left, stemWidth, stemX, highest, lowest } = this.chordGeometry(chord);

    const group = svg('g');
    group.style.color = COLORS.note;

    // A head moved over for a second sits a head's width away, sharing the stem's edge
    // (to the right of an up-stem, to the left of a down-stem).
    const shift = (headWidth - (value === 'whole' ? 0 : stemWidth)) * (chord.stemUp ? 1 : -1);
    const displaced = chord.notes.some((note) => note.displaced);
    const headsLeft = displaced && shift < 0 ? left + shift : left;
    const headsRight = (displaced && shift > 0 ? left + shift : left) + headWidth;

    for (const step of chord.ledgerSteps) {
      const y = yOf(step);
      const extension = LEDGER_EXTENSION * space;
      group.append(
        svg('line', {
          x1: headsLeft - extension,
          x2: headsRight + extension,
          y1: y,
          y2: y,
          stroke: 'currentColor',
          'stroke-width': space * 0.16,
        }),
      );
    }

    for (const note of chord.notes) {
      const y = yOf(note.step);
      group.append(this.noteGlyph(NOTEHEAD[value], note.displaced ? left + shift : left, y));
      // Accidentals keep clear of every head (a voice moved aside for a second keeps them left of the
      // other voice's head too); dots follow the rightmost head.
      if (note.accidental) {
        const clearOf = headsLeft - (chord.voiceShift ? headWidth : 0);
        group.append(this.noteGlyph(ACCIDENTAL_GLYPH[note.accidental], clearOf - ACCIDENTAL_OFFSET * space, y));
      }
      // A dot goes in a space: for a note on a line, in the space just above.
      if (dots) {
        const dotStep = note.step % 2 === 0 ? note.step - 1 : note.step;
        group.append(this.noteGlyph(AUGMENTATION_DOT, headsRight + DOT_OFFSET * space, yOf(dotStep)));
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
  private drawBeam(beam: Beam, stemEnds: Map<number, number>): SVGPolygonElement[] {
    const { space } = this;
    const chords = beam.chords.map((index) => this.chords[index]);
    const geometry = chords.map((chord) => this.chordGeometry(chord));
    const levels = Math.max(...chords.map((chord) => flagCount(chord.duration.value)));
    const minStem = (MIN_BEAMED_STEM + (levels - 1) * BEAM_SPACING) * space;
    // Stems both ways (a group across both staves): a level beam between the notes.
    const kneed = chords.some((chord) => chord.stemUp !== beam.stemUp);
    const plain = kneed
      ? kneeBeamLine(
          chords.map((chord, i) => {
            const g = geometry[i];
            return { x: g.stemX, noteY: chord.stemUp ? g.highest : g.lowest, stemUp: chord.stemUp };
          }),
          SHORTEST_KNEED_STEM * space,
        )
      : beamLine(
          geometry.map((g) => ({ x: g.stemX, noteY: beam.stemUp ? g.highest : g.lowest })),
          beam.stemUp,
          {
            stem: (STEM_LENGTH + Math.max(0, levels - 2) * BEAM_SPACING) * space,
            minStem,
            maxRise: BEAM_MAX_RISE * space,
          },
        );
    // Clear of another voice's notes under the beam (a beam across both staves has none in its way).
    const line = kneed
      ? plain
      : avoidNotes(
          plain,
          geometry.map((g) => ({ x: g.stemX, noteY: beam.stemUp ? g.highest : g.lowest })),
          beam.stemUp,
          this.otherVoiceHeads(beam, geometry),
          {
            band: (BEAM_THICKNESS + (levels - 1) * BEAM_SPACING) * space,
            clearance: BEAM_CLEARANCE * space,
            shortestStem: SHORTEST_BEAMED_STEM * space,
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

  /** Noteheads of the other chords on a beam's staff, within its reach: what the beam must keep off. */
  private otherVoiceHeads(beam: Beam, geometry: ReturnType<SvgStaff['chordGeometry']>[]): BeamObstacle[] {
    const { space } = this;
    const staff = this.chords[beam.chords[0]].staff;
    const left = Math.min(...geometry.map((g) => g.left)) - space;
    const right = Math.max(...geometry.map((g) => g.left + g.headWidth)) + space;
    const own = new Set(beam.chords);
    const heads: BeamObstacle[] = [];
    this.chords.forEach((chord, index) => {
      if (own.has(index) || chord.staff !== staff) return;
      const g = this.chordGeometry(chord);
      if (g.left + g.headWidth < left || g.left > right) return;
      for (const note of chord.notes) {
        const y = g.yOf(note.step);
        heads.push({ x: g.left + g.headWidth / 2, top: y - space / 2, bottom: y + space / 2 });
      }
    });
    return heads;
  }

  /**
   * A tuplet's number (and bracket, if it has one) beyond the stems on their side: over a beam,
   * or over the notes of an unbeamed group.
   */
  private drawTuplet(tuplet: Tuplet, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const chords = tuplet.chords.map((index) => this.chords[index]);
    const geometry = chords.map((chord) => this.chordGeometry(chord));
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
   * Key and time changes where they happen, as printed: a double bar line before a new key, naturals
   * cancelling what the old key had, the new key signature, the new time signature.
   */
  private drawSignatureChanges(score: Score): SVGElement[] {
    const { space } = this;
    const shapes: SVGElement[] = [];
    const top = this.trebleTop();
    const bottom = this.systemBottom();
    for (const change of this.changes) {
      const line = this.barLineX(change.bar);
      const beat = score.writtenBarBeats[change.bar];
      // A ‖: draws its own thick line; otherwise a new key gets a double bar line.
      if (change.key && !score.navigation[change.bar]?.repeatStart) {
        const x = line - 0.5 * space;
        shapes.push(svg('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: COLORS.barLine, 'stroke-width': 1 }));
      }
      const staves: [Clef, number][] = [
        [clefAt(score, 1, beat), top],
        [clefAt(score, 2, beat), this.bassTop()],
      ];
      let x = line + (score.navigation[change.bar]?.repeatStart ? REPEAT_GLYPH_WIDTH * space : 0) + CHANGE_GAP_BEFORE * space;
      if (change.key) {
        const { from, to } = change.key;
        const naturals = cancelledSteps(from, to, 'treble').length;
        for (const [clef, staffTop] of staves) {
          cancelledSteps(from, to, clef).forEach((step, i) => {
            shapes.push(this.inked(NATURAL, x + i * NATURAL_ADVANCE * space, staffTop + (step * space) / 2));
          });
        }
        x += naturals * NATURAL_ADVANCE * space + (naturals > 0 ? SIGNATURE_GAP * space : 0);
        const advance = (to >= 0 ? SHARP_ADVANCE : FLAT_ADVANCE) * space;
        for (const [clef, staffTop] of staves) {
          keySignatureSteps(to, clef).forEach((step, i) => {
            shapes.push(this.inked(to > 0 ? SHARP : FLAT, x + i * advance, staffTop + (step * space) / 2));
          });
        }
        x += keySignatureWidth({ beat, fifths: to, minor: false }) * space;
      }
      if (change.time) {
        const center = x + (timeSignatureWidth(change.time) * space) / 2;
        for (const [, staffTop] of staves) {
          const numerator = this.inked(timeDigits(change.time.numerator), center, staffTop + space);
          const denominator = this.inked(timeDigits(change.time.denominator), center, staffTop + 3 * space);
          numerator.setAttribute('text-anchor', 'middle');
          denominator.setAttribute('text-anchor', 'middle');
          shapes.push(numerator, denominator);
        }
      }
    }
    return shapes;
  }

  /** Metronome marks over the treble staff where the tempo is set: "♩ = 90", "♩. = 60". */
  private drawTempoMarks(score: Score): SVGElement[] {
    const { space } = this;
    const shapes: SVGElement[] = [];
    for (const mark of score.tempoMarks) {
      const x = this.px(beatPosition(score, barAtBeat(score, mark.beat), mark.beat)) - 0.5 * space;
      // Over an 8va bracket if there is one here.
      const bracket = this.octaveBrackets.find((b) => b.staff === 'treble' && b.above && x < b.right && x + 5 * space > b.left);
      const y = Math.min(this.trebleTop() - TEMPO_MARK_RISE * space, bracket ? bracket.y - TEMPO_OVER_OCTAVE * space : Infinity);
      const note = svg('text', { x, y, 'font-size': space * TEMPO_NOTE_SIZE, 'font-family': MUSIC_FONT });
      note.textContent = METRONOME_NOTE[mark.unit.value] + (mark.unit.dots ? METRONOME_DOT : '');
      const words = svg('text', {
        x: x + (TEMPO_NOTE_WIDTH + (mark.unit.dots ? TEMPO_DOT_WIDTH : 0)) * space,
        y,
        'font-size': space * 1.3,
        'font-family': "'Times New Roman', Georgia, serif",
        'font-weight': 'bold',
      });
      words.textContent = `= ${mark.perMinute}`;
      for (const element of [note, words]) element.style.setProperty('fill', COLORS.note);
      shapes.push(note, words);
    }
    return shapes;
  }

  /** A music glyph (reference line at `y`) in the ink colour, outside the chords that light up. */
  private inked(codepoint: string, x: number, y: number): SVGTextElement {
    const glyph = this.noteGlyph(codepoint, x, y);
    glyph.style.setProperty('fill', COLORS.note);
    return glyph;
  }

  /**
   * Repeat signs at bar lines, volta brackets over the treble staff, segno and coda signs, and
   * the words of jumps ("D.C. al Fine", "To Coda") over the ends of their bars.
   */
  private drawNavigation(navigation: readonly BarNavigation[]): SVGElement[] {
    const { space } = this;
    const shapes: SVGElement[] = [];
    const staves = [this.trebleTop(), this.bassTop()];
    const barStart = (i: number) => this.barLineX(i);
    const barEnd = (i: number) => this.barLineX(i + 1);
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
        // Over the bar numbers under it (they may have risen over high notes).
        const numbers = this.barNumberY.slice(i, last + 1);
        const y = Math.min(top - 4.6 * space, ...numbers.map((numberY) => numberY - VOLTA_OVER_NUMBER * space));
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

  /** The sustain pedal under the lower staff: "Ped." and "✱" signs, and bracket lines. */
  /**
   * The pedals. Under the lower staff, the right one ("Ped." and "✱" signs, bracket lines) and the
   * middle one ("Sost." and a line); each sits clear of the low notes, stems and marks above it, and
   * a line keeps one height all along. The left one in words between the staves.
   */
  private drawPedal(score: Score, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const { signs, lines, words } = layoutPedal(score);
    const shapes: SVGElement[] = [];
    const baseline = (left: number, right: number) =>
      Math.max(this.systemBottom() + PEDAL_DROP * space, this.bassFloor(left, right, stemEnds) + PEDAL_CLEARANCE * space);

    // "Ped." / "Sost." start a little before their beat, under the left edge of the note they go with.
    const pressLeft = (x: number) => this.px(x) - 0.5 * space;
    const signWidth = (pedal: 'sustain' | 'sostenuto') => (pedal === 'sustain' ? PEDAL_PRESS_WIDTH : PEDAL_SOSTENUTO_WIDTH) * space;
    // A sign followed by a line sits at the line's height.
    const lineBaselines = new Map<string, number>();
    // Where the right pedal's marks are, so the middle pedal's line can keep out of their way.
    const sustainSpans: [number, number][] = signs
      .filter((sign) => sign.kind !== 'sostenuto')
      .map((sign) => [pressLeft(sign.x) - 2 * space, pressLeft(sign.x) + PEDAL_PRESS_WIDTH * space]);

    const hook = PEDAL_HOOK * space;
    const notch = PEDAL_NOTCH * space;
    for (const line of lines) {
      // ⌊ (or "Ped." and then the line), ∧ at each change, and ⌋ just before the release.
      const left = pressLeft(line.from);
      const from = left + (line.afterSign ? signWidth(line.pedal) + 0.3 * space : 0);
      // Measured from the bar line when the release is on one (the next bar may have room after it).
      const to = Math.max(from + space, this.edgeX(line.to) - (PEDAL_LINE_GAP - BAR_LINE_GAP) * space);
      let y = baseline(left, to);
      if (line.pedal === 'sustain') sustainSpans.push([left, to]);
      else if (sustainSpans.some(([a, b]) => a < to && b > left)) y += PEDAL_ROW * space;
      if (line.afterSign) lineBaselines.set(`${line.pedal} ${line.from}`, y);
      const points = line.afterSign ? [`${from},${y}`] : [`${from},${y - hook}`, `${from},${y}`];
      for (const change of line.changes) {
        const at = this.px(change);
        if (at - notch <= from || at + notch >= to) continue;
        points.push(`${at - notch},${y}`, `${at},${y - hook}`, `${at + notch},${y}`);
      }
      points.push(`${to},${y}`, `${to},${y - hook}`);
      const shape = svg('polyline', { points: points.join(' '), fill: 'none', 'stroke-width': space * 0.12 });
      shape.style.setProperty('stroke', COLORS.note);
      shapes.push(shape);
    }

    for (const sign of signs) {
      const release = sign.kind === 'release';
      const pedal = sign.kind === 'sostenuto' ? 'sostenuto' : 'sustain';
      const releaseX = this.edgeX(sign.x) - (PEDAL_RELEASE_BEFORE - BAR_LINE_GAP) * space;
      const left = release ? releaseX - 0.9 * space : pressLeft(sign.x);
      const y =
        (!release && lineBaselines.get(`${pedal} ${sign.x}`)) || baseline(left, left + (release ? 1.8 * space : signWidth(pedal)));
      const codepoint = release ? PEDAL_RELEASE : pedal === 'sostenuto' ? PEDAL_SOSTENUTO : PEDAL_PRESS;
      const glyph = this.noteGlyph(codepoint, release ? releaseX : left, y);
      if (release) glyph.setAttribute('text-anchor', 'middle');
      glyph.style.setProperty('fill', COLORS.note);
      shapes.push(glyph);
    }

    // The left pedal's words, in italics between the staves, like other playing directions.
    // Just under the upper staff, above the dynamics line.
    const wordsY = this.trebleTop() + (LINES_PER_STAFF - 1 + SOFT_PEDAL_DROP) * space;
    for (const { x, text } of words) {
      const element = svg('text', {
        // Just past the notehead, clear of a stem hanging down from its left side.
        x: this.px(x) + SOFT_PEDAL_INSET * space,
        y: wordsY,
        'font-size': space * 1.3,
        'font-family': "'Times New Roman', Georgia, serif",
        'font-style': 'italic',
      });
      element.textContent = text;
      element.style.setProperty('fill', COLORS.note);
      shapes.push(element);
    }
    return shapes;
  }


  /**
   * Dynamics as printed: marks in the music font, words in italics, hairpins as two lines
   * opening (crescendo) or closing (diminuendo). Between the staves, clear of the upper staff's
   * low notes; or under the lower staff when the file puts them there.
   */
  private drawDynamics(score: Score, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const shapes: SVGElement[] = [];
    const x = (beat: number) => this.px(beatPosition(score, barAtBeat(score, beat), beat));
    // Between the staves if the notes of both leave room there (a mark is about two spaces
    // tall), otherwise under the lower staff, as the file asks for some marks anyway.
    const baseline = (below: boolean, left: number, right: number) => {
      const bass = this.inkExtent('bass', left, right, stemEnds);
      const under = () => {
        const y = Math.max(this.systemBottom(), bass.bottom) + DYNAMICS_CLEARANCE * space;
        this.dynamicsBelow.push({ left, right, y });
        return y;
      };
      if (below) return under();
      const upperBottom = this.trebleTop() + (LINES_PER_STAFF - 1) * space;
      const treble = this.inkExtent('treble', left, right, stemEnds);
      const y = Math.max(upperBottom + DYNAMICS_DROP * space, treble.bottom + DYNAMICS_CLEARANCE * space);
      const room = Math.min(this.bassTop(), bass.top) - DYNAMICS_BELOW_LINE * space;
      return y <= room ? y : under();
    };

    for (const mark of score.dynamics) {
      const at = x(mark.beat);
      if (mark.letters) {
        const width = mark.text.length * DYNAMIC_LETTER_WIDTH * space;
        const glyph = this.inked([...mark.text].map((letter) => DYNAMIC_LETTERS[letter] ?? '').join(''), at, baseline(mark.below, at - width / 2, at + width / 2));
        glyph.setAttribute('text-anchor', 'middle');
        shapes.push(glyph);
      } else {
        const words = svg('text', {
          x: at - 0.5 * space,
          y: baseline(mark.below, at, at + 4 * space),
          'font-size': space * 1.3,
          'font-family': "'Times New Roman', Georgia, serif",
          'font-style': 'italic',
        });
        words.textContent = mark.text;
        words.style.setProperty('fill', COLORS.note);
        shapes.push(words);
      }
    }

    for (const hairpin of score.hairpins) {
      // Clear of a mark at either end: start after it, end before it.
      const markAt = (beat: number) => score.dynamics.find((m) => m.letters && Math.abs(m.beat - beat) < 1e-6);
      const startMark = markAt(hairpin.start);
      const endMark = markAt(hairpin.end);
      const from = x(hairpin.start) + (startMark ? (startMark.text.length * DYNAMIC_LETTER_WIDTH) / 2 + 0.4 : -0.5) * space;
      const endX = this.edgeX(beatPosition(score, barAtBeat(score, hairpin.end), hairpin.end));
      const to = Math.max(from + 2 * space, endX - (endMark ? (endMark.text.length * DYNAMIC_LETTER_WIDTH) / 2 + 0.4 : 0.8) * space);
      const middle = baseline(hairpin.below, from, to) - HAIRPIN_RISE * space;
      const open = HAIRPIN_OPENING * space;
      const [narrow, wide] = hairpin.type === 'crescendo' ? [from, to] : [to, from];
      const line = svg('polyline', {
        points: `${wide},${middle - open} ${narrow},${middle} ${wide},${middle + open}`,
        fill: 'none',
        'stroke-width': space * 0.12,
      });
      line.style.setProperty('stroke', COLORS.note);
      shapes.push(line);
    }
    return shapes;
  }

  /**
   * Bar numbers over the treble staff, just after each bar line; raised over a high note or stem
   * at the start of the bar, so they never sit on it.
   */
  private drawBarNumbers(score: Score, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const top = this.trebleTop();
    this.barNumberY = [];
    return score.writtenBarBeats.map((_, index) => {
      const x = this.barLineX(index) + BAR_NUMBER_INSET * space;
      const ink = this.inkExtent('treble', x, x + BAR_NUMBER_WIDTH * space, stemEnds);
      const y = Math.min(top - BAR_NUMBER_RISE * space, ink.top - BAR_NUMBER_CLEARANCE * space);
      this.barNumberY.push(y);
      const number = svg('text', {
        x,
        y,
        fill: COLORS.barNumber,
        'font-size': space * 1.1,
        'font-family': 'system-ui, sans-serif',
      });
      number.textContent = String(writtenBarNumber(score, index));
      return number;
    });
  }

  /**
   * An octave shift bracket: "8va" and a dashed line clear of the notes under it, ending with a
   * hook towards the staff just before the notes go back to their own octave.
   */
  private drawOctaveShift(shift: StaffOctaveShift, stemEnds: Map<number, number>): SVGElement[] {
    const { space } = this;
    const above = shift.octaves > 0;
    const glyphs = above ? OCTAVE_GLYPH_ABOVE : OCTAVE_GLYPH_BELOW;
    const glyph = glyphs[Math.min(glyphs.length, Math.abs(shift.octaves)) - 1];
    const glyphWidth = (above ? OCTAVE_GLYPH_WIDTH_ABOVE : OCTAVE_GLYPH_WIDTH_BELOW) * space;
    const left = this.px(shift.from) - 0.5 * space;
    const right = Math.max(left + glyphWidth + space, this.edgeX(shift.to));
    const staffTop = shift.staff === 'treble' ? this.trebleTop() : this.bassTop();
    const staffBottom = staffTop + (LINES_PER_STAFF - 1) * space;
    const ink = this.inkExtent(shift.staff, left, right, stemEnds);
    const y = above
      ? Math.min(staffTop, ink.top) - OCTAVE_CLEARANCE * space + OCTAVE_LINE_RISE * space
      : Math.max(staffBottom, ink.bottom) + OCTAVE_CLEARANCE * space + OCTAVE_LINE_RISE * space;
    const lineY = y - OCTAVE_LINE_RISE * space;
    const hook = (above ? 1 : -1) * OCTAVE_HOOK * space;
    const lineStart = left + glyphWidth + 0.3 * space;
    this.octaveBrackets.push({ staff: shift.staff, above, left, right, y });
    const line = svg('polyline', {
      points: `${lineStart},${lineY} ${right},${lineY} ${right},${lineY + hook}`,
      fill: 'none',
      'stroke-width': space * 0.12,
      'stroke-dasharray': `${space * 0.6} ${space * 0.4}`,
    });
    line.style.setProperty('stroke', COLORS.note);
    return [this.inked(glyph, left, y), line];
  }

  /** How far up and down the notes and stems of one staff reach between two x's (at least the staff itself). */
  private inkExtent(staff: Clef, left: number, right: number, stemEnds: Map<number, number>): { top: number; bottom: number } {
    const { space } = this;
    let top = Infinity;
    let bottom = -Infinity;
    this.chords.forEach((chord, index) => {
      if (chord.staff !== staff) return;
      const g = this.chordGeometry(chord);
      if (g.left + g.headWidth < left || g.left > right) return;
      top = Math.min(top, g.highest - space / 2);
      bottom = Math.max(bottom, g.lowest + space / 2);
      if (chord.duration.value === 'whole') return;
      const stemEnd = stemEnds.get(index) ?? (chord.stemUp ? g.highest - STEM_LENGTH * space : g.lowest + STEM_LENGTH * space);
      if (chord.stemUp) top = Math.min(top, stemEnd);
      else bottom = Math.max(bottom, stemEnd);
    });
    return { top, bottom };
  }

  /** The lowest point (largest y) of the lower staff's notes, down stems, marks and 8vb brackets under them between two x's. */
  private bassFloor(left: number, right: number, stemEnds: Map<number, number>): number {
    const { space } = this;
    let floor = this.systemBottom();
    const bottoms = new Map<number, number>(); // chord → its lowest point
    this.chords.forEach((chord, index) => {
      if (chord.staff !== 'bass') return;
      const g = this.chordGeometry(chord);
      if (g.left + g.headWidth < left || g.left > right) return;
      let bottom = g.lowest + space / 2;
      if (!chord.stemUp && chord.duration.value !== 'whole') bottom = Math.max(bottom, stemEnds.get(index) ?? g.lowest + STEM_LENGTH * space);
      bottoms.set(index, bottom);
      floor = Math.max(floor, bottom);
    });
    for (const mark of this.marks) {
      if (mark.above || !bottoms.has(mark.chord)) continue;
      floor = Math.max(floor, this.chordGeometry(this.chords[mark.chord]).yOf(mark.step) + MARK_DEPTH * space);
    }
    // An 8vb bracket under the staff (its glyph sits on the baseline, the hook reaches up).
    for (const bracket of this.octaveBrackets) {
      if (bracket.staff !== 'bass' || bracket.above || bracket.right < left || bracket.left > right) continue;
      floor = Math.max(floor, bracket.y + OCTAVE_BRACKET_DEPTH * space);
    }
    // Dynamics pushed under the staff.
    for (const mark of this.dynamicsBelow) {
      if (mark.right < left || mark.left > right) continue;
      floor = Math.max(floor, mark.y + DYNAMICS_BELOW_LINE * space);
    }
    return floor;
  }

  /** A rest glyph (with its dot), centred on its beat. */
  private drawRest(rest: StaffRest): SVGTextElement[] {
    const { space } = this;
    const top = rest.staff === 'treble' ? this.trebleTop() : this.bassTop();
    const { value, dots } = rest.duration;
    const width = REST_WIDTH[value] * space;
    const left = this.px(rest.x) - width / 2;
    const y = top + (rest.step * space) / 2;
    const glyphs = [this.noteGlyph(REST[value], left, y)];
    if (dots) glyphs.push(this.noteGlyph(AUGMENTATION_DOT, left + width + DOT_OFFSET * space, top + 1.5 * space));
    return glyphs;
  }

  /** An articulation or fermata, centred over (or under) the notehead. */
  private drawMark(mark: StaffMark): SVGTextElement {
    const { yOf, left, headWidth } = this.chordGeometry(this.chords[mark.chord]);
    const [above, below] = MARK_GLYPHS[mark.kind];
    const glyph = this.noteGlyph(mark.above ? above : below, left + headWidth / 2, yOf(mark.step));
    glyph.setAttribute('text-anchor', 'middle');
    return glyph;
  }

  /**
   * A phrasing slur. Each end sits just beyond its notehead, or beyond the stem end when the slur
   * is on the stem side; the curve then rises (or sinks) to clear every chord in between.
   */
  private drawSlur(phrase: StaffSlur, stemEnds: Map<number, number>): SVGPathElement {
    const { space } = this;
    const direction = phrase.above ? -1 : 1;
    const outerPoint = (index: number) => {
      const chord = this.chords[index];
      const g = this.chordGeometry(chord);
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
  private drawTie(tie: Tie): SVGPathElement {
    const { space } = this;
    const from = this.chordGeometry(this.chords[tie.from]);
    const to = this.chordGeometry(this.chords[tie.to]);
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

/** The bar (index into `starts`) whose start is at or before `x` on the tape. */
function tapeBarAt(starts: readonly number[], x: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= x + 1e-9) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** The room a key or time change needs before the bar's first note, in staff spaces. */
function signatureChangeWidth(change: SignatureChange): number {
  let width = CHANGE_GAP_BEFORE + CHANGE_GAP_AFTER;
  if (change.key) {
    const naturals = cancelledSteps(change.key.from, change.key.to, 'treble').length;
    width += naturals * NATURAL_ADVANCE + (naturals > 0 ? SIGNATURE_GAP : 0);
    width += keySignatureWidth({ beat: 0, fifths: change.key.to, minor: false });
  }
  if (change.time) width += timeSignatureWidth(change.time) + SIGNATURE_GAP;
  return width;
}
