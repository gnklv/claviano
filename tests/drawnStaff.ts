import type { StaffColors } from '../src/application/ports/StaffView';
import type { StaffChord, StaffGrace } from '../src/domain/notation/engraving';
import type { Hand } from '../src/domain/note';
import type { Score } from '../src/domain/score';
import type { GroupShape, Shape, TextShape } from '../src/infrastructure/render/staff/shapes';
import type { Lit } from '../src/infrastructure/render/staff/sounding';
import type { TapeDrawing } from '../src/infrastructure/render/staff/tapeDrawing';
import { TapeStaff, type StaffSurface } from '../src/infrastructure/render/TapeStaff';

/*
 * A staff drawn on a surface that draws nothing and keeps what it is shown, in the test DOM (which
 * has no layout: the container is given its size): what the staff decided to draw, read as shapes,
 * whatever draws them.
 */

export class ShownSurface implements StaffSurface {
  readonly background = document.createElement('div');
  readonly tapeParts: readonly Element[] = [];
  /** The staff lines and the left column, as last shown. */
  column: readonly Shape[] = [];
  /** The tape as last drawn: another object each time it is drawn anew. */
  tape: TapeDrawing | null = null;
  sounds: { readonly chords: readonly StaffChord[]; readonly graces: readonly StaffGrace[] } = { chords: [], graces: [] };
  overlay: readonly Shape[] = [];
  loop: readonly Shape[] = [];
  lit: Lit = { chords: [], graces: [] };
  /** Where the tape was moved to last (NaN: never). */
  offset = Number.NaN;

  setColors(): void {}
  sized(): void {}
  showBackground(shapes: readonly Shape[]): void {
    this.column = shapes;
  }
  showTape(drawing: TapeDrawing | null, sounds: ShownSurface['sounds']): void {
    this.tape = drawing;
    this.sounds = sounds;
    this.lit = { chords: [], graces: [] };
  }
  showOverlay(shapes: readonly Shape[]): void {
    this.overlay = shapes;
  }
  showLoop(shapes: readonly Shape[]): void {
    this.loop = shapes;
  }
  light(lit: Lit): void {
    this.lit = lit;
  }
  move(offset: number): void {
    this.offset = offset;
  }

  /** The tape's shapes, in the order they are drawn: under the music, then the chords and grace notes, then over them. */
  get tapeShapes(): Shape[] {
    const tape = this.tape;
    return tape ? [...tape.lines, tape.rests, ...tape.chords, ...tape.graces, tape.beams] : [];
  }
}

/** Colours named for what they are, to read them back where they are used. */
export const STAFF_COLORS: StaffColors = {
  background: '#background',
  staffLine: '#staffLine',
  barLine: '#barLine',
  barNumber: '#barNumber',
  ink: '#ink',
  loop: '#loop',
  loopEdge: '#loopEdge',
  cursor: '#cursor',
  hand: { right: '#right', left: '#left' },
};

export function drawStaff(score: Score | null, size = { width: 1024, height: 300 }): { staff: TapeStaff; shown: ShownSurface; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientWidth: { get: () => size.width, configurable: true },
    clientHeight: { get: () => size.height, configurable: true },
  });
  const shown = new ShownSurface();
  const staff = new TapeStaff(container, shown, STAFF_COLORS);
  staff.setScore(score);
  staff.render(0);
  return { staff, shown, container };
}

/** Every shape within these, groups opened, each with the group it is in (the innermost). */
export function flat(shapes: readonly Shape[], within: GroupShape | null = null): { shape: Shape; group: GroupShape | null }[] {
  return shapes.flatMap((shape) => (shape.kind === 'group' ? flat(shape.children, shape) : [{ shape, group: within }]));
}

/** Everything the staff shows now: the left column, the tape, and the shades behind the music. */
export const everything = (shown: ShownSurface): Shape[] => flat([...shown.column, ...shown.loop, ...shown.overlay, ...shown.tapeShapes]).map((each) => each.shape);

/** The words and glyphs the staff shows. */
export const texts = (shown: ShownSurface): TextShape[] => everything(shown).filter((shape): shape is TextShape => shape.kind === 'text');

/** The hands of what is lit now: the chords, then the grace notes. */
export const lit = (shown: ShownSurface): Hand[] => [...shown.lit.chords.map((index) => shown.sounds.chords[index].hand), ...shown.lit.graces.map((index) => shown.sounds.graces[index].hand)];

/** The bars shaded behind the music: the loop's, the one under the pointer, those being selected. */
export const shaded = (shown: ShownSurface) => [...shown.loop, ...shown.overlay].filter((shape) => shape.kind === 'rect');

/** Numbers to a hundredth of a pixel: the noise of arithmetic is not a change in the drawing. */
const rounded = (value: number): number => Math.round(value * 100) / 100;

/** Music glyphs are private-use characters: by their code, so the file reads in any font. */
const spelled = (text: string): string => [...text].map((c) => (c.codePointAt(0)! >= 0xe000 ? `U+${c.codePointAt(0)!.toString(16).toUpperCase()}` : c)).join('');

/** One line for each shape, nested as in the drawing: its kind, then what it is drawn with. */
export function drawing(shapes: readonly Shape[], depth = 0): string {
  return shapes
    .map((shape) => {
      const { kind, ...rest } = shape;
      const said = Object.entries(rest)
        .filter(([name, value]) => name !== 'children' && value !== undefined && name !== 'text')
        .map(([name, value]) => `${name}=${Array.isArray(value) ? value.map((n: number) => rounded(n)).join(',') : typeof value === 'number' ? rounded(value) : String(value)}`)
        .join(' ');
      const text = shape.kind === 'text' ? ` ${spelled(shape.text)}` : '';
      const line = `${'  '.repeat(depth)}${kind}${said ? ` ${said}` : ''}${text}\n`;
      return line + (shape.kind === 'group' ? drawing(shape.children, depth + 1) : '');
    })
    .join('');
}

/** What a staff draws for a piece, whole: the left column, then the tape. */
export const staffDrawing = (shown: ShownSurface): string => `column\n${drawing(shown.column, 1)}tape\n${drawing(shown.tapeShapes, 1)}`;
