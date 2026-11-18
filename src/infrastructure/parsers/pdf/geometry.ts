import { ScoreLoadError } from '../../../application/ports/ScoreParser';
import type { PdfContent, PdfFont } from './document';

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfGlyph extends PdfPoint {
  text: string;
  code: number;
  /** Glyphs painted in the same PDF text object may form one direction. */
  textObject?: number;
  font: string;
  size: number;
}

export interface PdfSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface PdfCubicBezier {
  readonly from: PdfPoint;
  readonly control1: PdfPoint;
  readonly control2: PdfPoint;
  readonly to: PdfPoint;
}

export interface PdfGeometry {
  glyphs: PdfGlyph[];
  segments: PdfSegment[];
  fills: PdfPoint[][];
  curvedFills: PdfCubicBezier[][];
}

type Matrix = readonly [number, number, number, number, number, number];
type Operand = string | number | Operand[];
interface Path {
  points: PdfPoint[];
  edges: Array<readonly [PdfPoint, PdfPoint]>;
  curves: PdfCubicBezier[];
  end: PdfPoint;
}

const identity: Matrix = [1, 0, 0, 1, 0, 0];

function matrix(values: readonly unknown[]): Matrix {
  if (values.length === 6 && values.every(value => typeof value === 'number' && Number.isFinite(value))) {
    return values as Matrix;
  }
  throw new ScoreLoadError('invalid-file', 'Invalid PDF drawing transform');
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

function translate(base: Matrix, x: number, y: number): Matrix {
  return multiply(base, [1, 0, 0, 1, x, y]);
}

function transform(m: Matrix, x: number, y: number): PdfPoint {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function readLiteral(source: string, offset: number): [string, number] {
  const escapes: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
  let value = '';
  let nesting = 1;
  while (offset < source.length) {
    const character = source[offset++]!;
    if (character === '\\') {
      const escaped = source[offset++] ?? '';
      if (escaped === '\r' && source[offset] === '\n') offset++;
      if (escaped === '\r' || escaped === '\n') continue;
      const octal = /^[0-7]{1,3}/.exec(escaped + source.slice(offset, offset + 2));
      if (octal) {
        value += String.fromCharCode(parseInt(octal[0], 8) & 255);
        offset += octal[0].length - 1;
      } else {
        value += escapes[escaped] ?? escaped;
      }
    } else {
      if (character === '(') nesting++;
      if (character === ')' && --nesting === 0) return [value, offset];
      if (character === '\r' && source[offset] === '\n') offset++;
      value += character === '\r' ? '\n' : character;
    }
  }
  throw new ScoreLoadError('invalid-file', 'Unterminated PDF text string');
}

function* operations(source: string): Generator<[string, Operand[]]> {
  /* eslint-disable no-control-regex -- PDF defines NUL as whitespace outside literal strings. */
  const lexer = /[\x00\t\n\f\r ]+|%[^\r\n]*|\(|<<|>>|<[0-9a-f\x00\t\n\f\r ]*>|[[\]]|\/?[^\x00\t\n\f\r ()<>[\]{}%/]+|./giy;
  let operands: Operand[] = [];
  const arrays: Operand[][] = [];
  for (let token = lexer.exec(source); token; token = lexer.exec(source)) {
    const word = token[0];
    if (/^[\x00\t\n\f\r %]/.test(word)) continue;
    const current = arrays.at(-1) ?? operands;
    if (word === '(') {
      const [literal, next] = readLiteral(source, lexer.lastIndex);
      current.push(literal);
      lexer.lastIndex = next;
    } else if (word[0] === '<' && word !== '<<') {
      let hex = word.slice(1, -1).replace(/[\x00\t\n\f\r ]/g, '');
      if (hex.length % 2) hex += '0';
      current.push(hex.replace(/../g, byte => String.fromCharCode(parseInt(byte, 16))));
    } else if (word === '[') {
      if (arrays.length >= 64) throw new ScoreLoadError('invalid-file', 'PDF drawing array nesting is too deep');
      const array: Operand[] = [];
      current.push(array);
      arrays.push(array);
    } else if (word === ']') {
      if (!arrays.pop()) throw new ScoreLoadError('invalid-file', 'Unmatched PDF drawing array terminator');
    } else if (word.startsWith('/')) {
      current.push(word.slice(1).replace(/#([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));
    } else if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      current.push(Number(word));
    } else if (arrays.length === 0) {
      yield [word, operands];
      operands = [];
    }
  }
  /* eslint-enable no-control-regex */
  if (arrays.length) throw new ScoreLoadError('invalid-file', 'Unterminated PDF drawing array');
}

interface GraphicsState {
  transform: Matrix;
  width: number;
  font: PdfFont | undefined;
  size: number;
  horizontal: number;
  characterSpacing: number;
  wordSpacing: number;
  leading: number;
  rise: number;
  textMode: number;
}

function interpret(
  content: PdfContent,
  geometry: PdfGeometry,
  inherited: GraphicsState,
  budget: { remaining: number },
  depth: number,
): void {
  if (depth > 32) throw new ScoreLoadError('invalid-file', 'PDF drawing forms nest too deeply');
  budget.remaining -= content.operators.length;
  if (budget.remaining < 0) throw new ScoreLoadError('unsupported-feature', 'PDF page drawing instructions are too large');
  let state = { ...inherited };
  if (content.matrix) state.transform = multiply(state.transform, matrix(content.matrix));
  const stack: GraphicsState[] = [];
  let textObject: number | undefined;
  let text = identity;
  let line = identity;
  let paths: Path[] = [];

  const startPath = (point: PdfPoint) => paths.push({ points: [point], edges: [], curves: [], end: point });
  const extendPath = (point: PdfPoint, controls?: readonly [PdfPoint, PdfPoint]) => {
    const path = paths.at(-1);
    if (!path) return;
    if (controls) path.curves.push({ from: path.end, control1: controls[0], control2: controls[1], to: point });
    else if (path.end.x !== point.x || path.end.y !== point.y) path.edges.push([path.end, point]);
    path.points.push(point);
    path.end = point;
  };
  const closePath = () => {
    const path = paths.at(-1);
    const first = path?.points[0];
    if (first && path.end !== first) extendPath(first);
  };
  const paint = (stroke: boolean, fill: boolean) => {
    const [a, b, c, d] = state.transform;
    for (const path of paths) {
      if (stroke) {
        for (const [from, to] of path.edges) {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.hypot(dx, dy);
          if (length === 0) continue;
          const width = state.width * Math.hypot(a * dy - b * dx, c * dy - d * dx) / length;
          geometry.segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, width });
        }
      }
      const first = path.points[0];
      const last = path.points.at(-1);
      const closed = first && last && first.x === last.x && first.y === last.y;
      const points = closed ? path.points.slice(0, -1) : path.points;
      if (fill && !path.curves.length && points.length >= 3) geometry.fills.push(points);
      if (fill && !path.edges.length && path.curves.length) geometry.curvedFills.push(path.curves);
    }
    paths = [];
  };

  const moveTextLine = (x: number, y: number) => {
    line = translate(line, x, y);
    text = line;
  };
  const showText = (items: Operand[]) => {
    const { font, size, horizontal, transform: ctm, characterSpacing, wordSpacing, rise, textMode } = state;
    if (!font || font.codeBytes < 1 || font.codeBytes > 4) return;
    for (const item of items) {
      if (typeof item === 'number') {
        text = translate(text, -item * size * horizontal / 1000, 0);
      } else if (typeof item === 'string') {
        for (let start = 0; start + font.codeBytes <= item.length; start += font.codeBytes) {
          let code = 0;
          for (let i = 0; i < font.codeBytes; i++) code = code * 256 + item.charCodeAt(start + i);
          if (textMode !== 3 && textMode !== 7) {
            const m = multiply(ctm, text);
            const point = transform(m, 0, rise);
            const glyph = font.unicode.get(code) ?? (font.codeBytes === 1 ? String.fromCharCode(code) : '');
            geometry.glyphs.push({ ...point, text: glyph, textObject, code, font: font.name, size: Math.abs(size) * Math.hypot(m[2], m[3]) });
          }
          const width = font.widths?.get(code) ?? font.defaultWidth ?? (font.codeBytes > 1 ? 1000 : 0);
          const spacing = characterSpacing + (font.codeBytes === 1 && code === 32 ? wordSpacing : 0);
          text = translate(text, (width * size / 1000 + spacing) * horizontal, 0);
        }
      }
    }
  };

  for (const [operator, operands] of operations(content.operators)) {
    const num = (index: number): number => {
      const value = operands[index];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ScoreLoadError('invalid-file', `Invalid PDF drawing operands for ${operator}`);
      return value;
    };
    const point = (index: number) => transform(state.transform, num(index), num(index + 1));
    switch (operator) {
      case 'q': stack.push({ ...state }); break;
      case 'Q': state = stack.pop() ?? state; break;
      case 'cm': state.transform = multiply(state.transform, matrix(operands)); break;
      case 'w': state.width = num(0); break;
      case 'm': startPath(point(0)); break;
      case 'l': extendPath(point(0)); break;
      case 'c': extendPath(point(4), [point(0), point(2)]); break;
      case 'v': {
        const end = paths.at(-1)?.end;
        if (end) extendPath(point(2), [end, point(0)]);
        break;
      }
      case 'y': {
        const end = point(2);
        extendPath(end, [point(0), end]);
        break;
      }
      case 'h': closePath(); break;
      case 're': {
        const x = num(0);
        const y = num(1);
        const width = num(2);
        const height = num(3);
        startPath(transform(state.transform, x, y));
        extendPath(transform(state.transform, x + width, y));
        extendPath(transform(state.transform, x + width, y + height));
        extendPath(transform(state.transform, x, y + height));
        closePath();
        break;
      }
      case 's': closePath(); paint(true, false); break;
      case 'S': paint(true, false); break;
      case 'f':
      case 'f*':
      case 'F': paint(false, true); break;
      case 'b':
      case 'b*': closePath(); paint(true, true); break;
      case 'B':
      case 'B*': paint(true, true); break;
      case 'n': paths = []; break;
      case 'BT': textObject = geometry.glyphs.length + 1; text = line = identity; break;
      case 'Tf':
        state.font = typeof operands[0] === 'string' ? content.fonts.get(operands[0]) : undefined;
        state.size = num(1);
        break;
      case 'Tm': text = line = matrix(operands); break;
      case 'TD':
        state.leading = -num(1);
        moveTextLine(num(0), num(1));
        break;
      case 'Td': moveTextLine(num(0), num(1)); break;
      case 'T*': moveTextLine(0, -state.leading); break;
      case 'TL': state.leading = num(0); break;
      case 'Tc': state.characterSpacing = num(0); break;
      case 'Tw': state.wordSpacing = num(0); break;
      case 'Tz': state.horizontal = num(0) / 100; break;
      case 'Ts': state.rise = num(0); break;
      case 'Tr': state.textMode = num(0); break;
      case 'Tj': showText(operands); break;
      case 'TJ':
        if (Array.isArray(operands[0])) showText(operands[0]);
        break;
      case "'":
        moveTextLine(0, -state.leading);
        showText(operands);
        break;
      case '"':
        state.wordSpacing = num(0);
        state.characterSpacing = num(1);
        moveTextLine(0, -state.leading);
        showText(operands.slice(2));
        break;
      case 'Do': {
        const form = typeof operands[0] === 'string' ? content.form(operands[0]) : undefined;
        if (form) interpret(form, geometry, state, budget, depth + 1);
        break;
      }
      case 'BI': throw new ScoreLoadError('unsupported-feature', 'Inline PDF drawing images are unsupported');
    }
  }
}

export function extractPdfGeometry(content: PdfContent): PdfGeometry {
  const geometry: PdfGeometry = { glyphs: [], segments: [], fills: [], curvedFills: [] };
  interpret(content, geometry, {
    transform: identity, width: 1, font: undefined, size: 0, horizontal: 1,
    characterSpacing: 0, wordSpacing: 0, leading: 0, rise: 0, textMode: 0,
  }, { remaining: 16 * 1024 * 1024 }, 0);
  return geometry;
}
