import { ScoreLoadError } from '../../../application/ports/ScoreParser';
import { inflate } from '../inflate';

type PdfName = { name: string };
type Reference = { ref: string };
type Value = number | boolean | null | string | PdfName | Reference | Value[] | Dictionary;
type Dictionary = Map<string, Value>;

export interface PdfFont {
  name: string;
  unicode: ReadonlyMap<number, string>;
  codeBytes: number;
  widths?: ReadonlyMap<number, number>;
  defaultWidth?: number;
}

export interface PdfContent {
  operators: string;
  fonts: ReadonlyMap<string, PdfFont>;
  form(name: string): PdfContent | undefined;
  matrix?: readonly number[];
}

function invalid(detail: string): never {
  throw new ScoreLoadError('invalid-file', `Invalid PDF: ${detail}`);
}

function unsupported(detail: string): never {
  throw new ScoreLoadError('unsupported-feature', `Unsupported PDF: ${detail}`);
}

/** PDF strings carry arbitrary bytes. Latin-1 TextDecoder would reinterpret bytes 128–159. */
function byteString(bytes: Uint8Array): string {
  let result = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return result;
}

/* eslint-disable no-control-regex -- NUL is whitespace in PDF syntax. */
const WHITESPACE = /(?:[\x00\t\n\f\r ]+|%[^\r\n]*)*/y;
const TOKEN = /<<|>>|<[^>]*>|[[\]()]|\/?[^\x00\t\n\f\r ()<>[\]{}%/]+/y;
const REF_TAIL = /[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+R(?=[\x00\t\n\f\r /<>[\]()%])/y;
const STREAM_HEADER = /[\x00\t\n\f\r ]*stream(?:\r\n|\n)/y;
/* eslint-enable no-control-regex */

class Syntax {
  constructor(private readonly source: string, public position: number) {}

  token(): string {
    WHITESPACE.lastIndex = this.position;
    WHITESPACE.exec(this.source);
    TOKEN.lastIndex = WHITESPACE.lastIndex;
    const match = TOKEN.exec(this.source);
    if (!match) invalid('unexpected token');
    this.position = TOKEN.lastIndex;
    return match[0];
  }

  value(token = this.token(), depth = 0): Value {
    if (depth > 64) invalid('object nesting is too deep');
    if (token === '<<') {
      const entries: Dictionary = new Map();
      for (let key = this.token(); key !== '>>'; key = this.token()) {
        if (!key.startsWith('/')) invalid('expected a dictionary key');
        entries.set(pdfName(key), this.value(this.token(), depth + 1));
      }
      return entries;
    }
    if (token === '[') {
      const values: Value[] = [];
      for (let next = this.token(); next !== ']'; next = this.token()) {
        values.push(this.value(next, depth + 1));
      }
      return values;
    }
    if (token === '(') {
      const start = this.position;
      let nesting = 1;
      while (this.position < this.source.length) {
        const character = this.source[this.position++];
        if (character === '\\') this.position++;
        if (character === '(') nesting++;
        if (character === ')' && --nesting === 0) return this.source.slice(start, this.position - 1);
      }
      invalid('unterminated string');
    }
    if (token.startsWith('/')) return { name: pdfName(token) };
    if (token === 'null') return null;
    if (token === 'true' || token === 'false') return token === 'true';
    if (token.startsWith('<')) return token;
    if (/^\d+$/.test(token)) {
      REF_TAIL.lastIndex = this.position;
      const match = REF_TAIL.exec(this.source);
      if (match) {
        this.position = REF_TAIL.lastIndex;
        return { ref: `${Number(token)} ${Number(match[1])}` };
      }
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
    invalid(`unexpected object token ${token.slice(0, 40)}`);
  }
}

function pdfName(token: string): string {
  return token.slice(1).replace(/#([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function dictionary(value: Value | undefined): Dictionary {
  if (!(value instanceof Map)) invalid('expected a dictionary');
  return value;
}

function name(value: Value | undefined): string | undefined {
  if (value && typeof value === 'object' && 'name' in value) return value.name;
}

function reference(value: Value | undefined): string {
  if (!value || typeof value !== 'object' || !('ref' in value)) invalid('expected an object reference');
  return value.ref;
}

function utf16(hex: string): string {
  let result = '';
  for (const unit of hex.match(/[\da-f]{4}/gi) ?? []) result += String.fromCharCode(parseInt(unit, 16));
  return result;
}

function unicodeMap(source: string): Map<number, string> {
  const unicode = new Map<number, string>();
  for (const [, block = ''] of source.matchAll(/beginbfchar\b([\s\S]*?)endbfchar\b/g)) {
    for (const [, code = '', target = ''] of block.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
      unicode.set(parseInt(code, 16), utf16(target));
    }
  }
  for (const [, block = ''] of source.matchAll(/beginbfrange\b([\s\S]*?)endbfrange\b/g)) {
    const entries = /<([\da-f]+)>\s*<([\da-f]+)>\s*(?:<([\da-f]+)>|\[([^\]]*)\])/gi;
    for (const [, start = '', end = '', target, array] of block.matchAll(entries)) {
      const first = parseInt(start, 16);
      const last = parseInt(end, 16);
      if (last > 0xffff || last < first) unsupported('unsupported font mapping range');
      if (target) {
        const prefix = target.slice(0, -4);
        const base = parseInt(target.slice(-4), 16);
        for (let code = first; code <= last; code++) {
          unicode.set(code, utf16(prefix) + String.fromCharCode(base + code - first));
        }
      } else {
        const targets = (array ?? '').matchAll(/<([\da-f]+)>/gi);
        let code = first;
        for (const [, hex = ''] of targets) {
          if (code > last) break;
          unicode.set(code++, utf16(hex));
        }
      }
    }
  }
  return unicode;
}

function cidWidths(values: Value[]): Map<number, number> {
  const widths = new Map<number, number>();
  for (let i = 0; i < values.length;) {
    const first = values[i++];
    const next = values[i++];
    if (!isCid(first)) invalid('invalid font width entry');
    if (Array.isArray(next)) {
      for (const [offset, width] of next.entries()) {
        if (!isCid(first + offset) || typeof width !== 'number') invalid('invalid font width');
        widths.set(first + offset, width);
      }
    } else {
      const width = values[i++];
      if (!isCid(next) || next < first || typeof width !== 'number') invalid('invalid font width range');
      for (let cid = first; cid <= next; cid++) widths.set(cid, width);
    }
  }
  return widths;
}

function isCid(value: Value | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff;
}

const MAX_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Reads the page tree and streams of classic, unencrypted vector PDFs. */
export function readPdf(bytes: Uint8Array): { pageCount: number; page(index: number): PdfContent } {
  const source = byteString(bytes);
  if (!source.startsWith('%PDF-')) invalid('missing file header');
  const start = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source);
  if (!start) invalid('missing cross-reference table');
  const offsets = new Map<string, number>();
  const xref = new Syntax(source, Number(start[1]));
  if (xref.token() !== 'xref') unsupported('expected a classic cross-reference table');
  for (let first = xref.token(); first !== 'trailer'; first = xref.token()) {
    const count = Number(xref.token());
    const id = Number(first);
    if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(count) || count < 0 || count > bytes.length) {
      invalid('malformed cross-reference section');
    }
    for (let index = 0; index < count; index++) {
      const offset = Number(xref.token());
      const generation = Number(xref.token());
      const status = xref.token();
      if (status === 'n') {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length || !Number.isSafeInteger(generation)) {
          invalid('malformed cross-reference entry');
        }
        offsets.set(`${id + index} ${generation}`, offset);
      } else if (status !== 'f') invalid('malformed cross-reference entry');
    }
  }
  const trailer = dictionary(xref.value());
  if (trailer.has('Encrypt')) unsupported('encrypted files');
  if (trailer.has('Prev') || trailer.has('XRefStm')) unsupported('incremental or hybrid cross-reference table');

  const objects = new Map<string, { value: Value; end: number }>();
  const object = (ref: string): { value: Value; end: number } => {
    const cached = objects.get(ref);
    if (cached) return cached;
    const offset = offsets.get(ref);
    if (offset === undefined) invalid('missing object');
    const syntax = new Syntax(source, offset);
    const key = `${Number(syntax.token())} ${Number(syntax.token())}`;
    if (key !== ref || syntax.token() !== 'obj') invalid('incorrect cross-reference offset');
    const value = syntax.value();
    const entry = { value, end: syntax.position };
    objects.set(ref, entry);
    return entry;
  };
  const resolve = (value: Value | undefined): Value | undefined => {
    if (value && typeof value === 'object' && 'ref' in value) return object(value.ref).value;
    return value;
  };

  const streams = new Map<string, string>();
  let decodedBytes = 0;
  const stream = (ref: string): string => {
    const cached = streams.get(ref);
    if (cached !== undefined) return cached;
    const { value, end } = object(ref);
    const data = dictionary(value);
    const length = resolve(data.get('Length'));
    STREAM_HEADER.lastIndex = end;
    if (!STREAM_HEADER.test(source) || typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
      invalid('invalid stream length or header');
    }
    const begin = STREAM_HEADER.lastIndex;
    const finish = begin + length;
    const endMarker = /(?:\r\n|\r|\n)?endstream\b/y;
    endMarker.lastIndex = finish;
    if (!endMarker.test(source)) invalid('truncated stream');
    const encoded = bytes.subarray(begin, finish);
    const filterValue = resolve(data.get('Filter'));
    const filter = Array.isArray(filterValue) && filterValue.length === 1 ? filterValue[0] : filterValue;
    const limit = Math.min(MAX_STREAM_BYTES, MAX_TOTAL_BYTES - decodedBytes);
    let decoded: Uint8Array;
    if (filter === undefined) {
      if (length > limit) unsupported('content streams are too large');
      decoded = encoded;
    } else if (name(filter) === 'FlateDecode') {
      const paramsValue = resolve(data.get('DecodeParms'));
      const params = Array.isArray(paramsValue) ? resolve(paramsValue[0]) : paramsValue;
      if (params instanceof Map && (resolve(params.get('Predictor')) ?? 1) !== 1) {
        unsupported('unsupported Flate predictor');
      }
      const cmf = encoded[0] ?? 0;
      const flags = encoded[1] ?? 0;
      if (encoded.length < 6 || (cmf & 0x0f) !== 8 || cmf > 0x78
        || ((cmf << 8) + flags) % 31 !== 0 || (flags & 0x20) !== 0) {
        invalid('invalid Flate stream header');
      }
      try {
        decoded = inflate(encoded.subarray(2, -4), 0, limit);
      } catch {
        invalid('cannot decompress Flate stream');
      }
    } else unsupported('unsupported content stream filter');
    decodedBytes += decoded.length;
    const result = byteString(decoded);
    streams.set(ref, result);
    return result;
  };

  const pages: { data: Dictionary; resources?: Value }[] = [];
  const visited = new Set<string>();
  const walk = (ref: string, inherited?: Value, depth = 0): void => {
    if (depth > 64 || visited.has(ref)) invalid('invalid page tree');
    visited.add(ref);
    const data = dictionary(object(ref).value);
    const resources = data.get('Resources') ?? inherited;
    const type = name(data.get('Type'));
    if (type === 'Page') {
      pages.push({ data, resources });
      return;
    }
    const kids = resolve(data.get('Kids'));
    if (type !== 'Pages' || !Array.isArray(kids)) invalid('invalid page tree');
    for (const kid of kids) walk(reference(kid), resources, depth + 1);
  };
  const catalog = dictionary(resolve(trailer.get('Root')));
  if (name(catalog.get('Type')) !== 'Catalog') invalid('missing catalog');
  walk(reference(catalog.get('Pages')));

  const fonts = new Map<Dictionary, PdfFont>();
  const font = (data: Dictionary): PdfFont => {
    const cached = fonts.get(data);
    if (cached) return cached;
    const toUnicode = data.get('ToUnicode');
    const value: PdfFont = {
      name: name(data.get('BaseFont'))?.replace(/^[A-Z]{6}\+/, '') ?? '',
      unicode: toUnicode === undefined ? new Map<number, string>() : unicodeMap(stream(reference(toUnicode))),
      codeBytes: name(data.get('Subtype')) === 'Type0' ? 2 : 1,
    };
    const descendants = resolve(data.get('DescendantFonts'));
    if (value.codeBytes === 2 && Array.isArray(descendants) && descendants.length > 0) {
      const metrics = dictionary(resolve(descendants[0]));
      const widths = resolve(metrics.get('W'));
      const defaultWidth = resolve(metrics.get('DW'));
      if (Array.isArray(widths)) value.widths = cidWidths(widths);
      value.defaultWidth = typeof defaultWidth === 'number' ? defaultWidth : 1000;
    }
    if (value.codeBytes === 1) {
      const widths = resolve(data.get('Widths'));
      if (widths !== undefined) {
        const first = resolve(data.get('FirstChar'));
        if (!isCid(first) || !Array.isArray(widths) || first + widths.length > 256) invalid('invalid simple font widths');
        const metrics = new Map<number, number>();
        for (const [offset, entry] of widths.entries()) {
          const width = resolve(entry);
          if (typeof width !== 'number' || !Number.isFinite(width)) invalid('invalid simple font width');
          metrics.set(first + offset, width);
        }
        value.widths = metrics;
      }
      const descriptor = resolve(data.get('FontDescriptor'));
      const missingWidth = descriptor instanceof Map ? resolve(descriptor.get('MissingWidth')) : undefined;
      if (typeof missingWidth === 'number') value.defaultWidth = missingWidth;
    }
    fonts.set(data, value);
    return value;
  };

  const content = (operators: string, resources: Value | undefined, ancestors: readonly string[]): PdfContent => {
    const resourcesData = resolve(resources);
    const entries = resourcesData === undefined ? new Map<string, Value>() : dictionary(resourcesData);
    const fontEntries = resolve(entries.get('Font'));
    const formEntries = resolve(entries.get('XObject'));
    const contentFonts = new Map<string, PdfFont>();
    if (fontEntries !== undefined) {
      for (const [key, value] of dictionary(fontEntries)) contentFonts.set(key, font(dictionary(resolve(value))));
    }
    return {
      operators,
      fonts: contentFonts,
      form(key) {
        if (formEntries === undefined) return;
        const value = dictionary(formEntries).get(key);
        if (value === undefined) return;
        const ref = reference(value);
        const data = dictionary(object(ref).value);
        if (name(data.get('Subtype')) !== 'Form') return;
        if (ancestors.length >= 64 || ancestors.includes(ref)) invalid('cyclic or deeply nested form');
        const form = content(stream(ref), data.get('Resources') ?? resources, [...ancestors, ref]);
        const matrix = resolve(data.get('Matrix'));
        if (matrix !== undefined) {
          if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every((entry) => typeof entry === 'number')) {
            invalid('invalid form matrix');
          }
          form.matrix = matrix;
        }
        return form;
      },
    };
  };

  return {
    pageCount: pages.length,
    page(index) {
      const page = Number.isInteger(index) ? pages[index] : undefined;
      if (!page) invalid('page index is out of range');
      const value = page.data.get('Contents');
      const contents = resolve(value);
      const refs = Array.isArray(contents) ? contents : value === undefined || value === null ? [] : [value];
      let size = 0;
      const operators = refs.map((ref) => {
        const operators = stream(reference(ref));
        size += operators.length + 1;
        if (size > MAX_TOTAL_BYTES) unsupported('page content streams are too large');
        return operators;
      });
      return content(operators.join('\n'), page.resources, []);
    },
  };
}

export function pageContent(bytes: Uint8Array, pageIndex: number): string {
  return readPdf(bytes).page(pageIndex).operators;
}
