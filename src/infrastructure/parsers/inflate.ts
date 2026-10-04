/*
 * Inflate: unpacks data packed with Deflate (RFC 1951), the compression inside ZIP archives.
 * Written out in full, like the MIDI reader: it is small, and unlike the browser's
 * DecompressionStream it answers at once, so opening a file stays one synchronous step.
 *
 * Deflate data is a run of blocks. Each is either stored as it is, or a stream of codes for
 * "this byte" and "the same `length` bytes as `distance` back"; the codes are Huffman codes:
 * shorter for what occurs more often, from tables fixed by the standard or sent in the block.
 */

export class InflateError extends Error {}

/** Canonical Huffman codes: how many codes there are of each length, and the symbols in code order. */
interface Huffman {
  readonly counts: Uint16Array;
  readonly symbols: Uint16Array;
}

const MAX_CODE_LENGTH = 15;

function huffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(MAX_CODE_LENGTH + 1);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offsets = new Uint16Array(MAX_CODE_LENGTH + 2);
  for (let length = 1; length <= MAX_CODE_LENGTH; length++) offsets[length + 1] = offsets[length] + counts[length];
  const symbols = new Uint16Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    if (lengths[symbol] !== 0) symbols[offsets[lengths[symbol]]++] = symbol;
  }
  return { counts, symbols };
}

/** Lengths 3–258 are sent as codes 257–285: a base and some extra bits. Distances likewise. */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** The order in which a block sends the lengths of the codes that describe its own tables. */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** The standard's own tables, for blocks that do not send theirs. */
const FIXED_LITERALS = huffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)));
const FIXED_DISTANCES = huffman(new Array<number>(30).fill(5));

/** Unpacks `input`. `size`, if known (a ZIP entry states it), saves growing the output as it goes. */
export function inflate(input: Uint8Array, size = 0): Uint8Array {
  let output = new Uint8Array(size || Math.max(1024, input.length * 4));
  let written = 0;
  let position = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  /** The next `count` bits (up to 16), the first one lowest. */
  const bits = (count: number): number => {
    while (bitCount < count) {
      if (position >= input.length) throw new InflateError('Unexpected end of compressed data');
      bitBuffer |= input[position++] << bitCount;
      bitCount += 8;
    }
    const value = bitBuffer & ((1 << count) - 1);
    bitBuffer >>>= count;
    bitCount -= count;
    return value;
  };

  /** Reads one code, bit by bit, until it is one of the codes of its length. */
  const symbol = ({ counts, symbols }: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= MAX_CODE_LENGTH; length++) {
      code |= bits(1);
      const count = counts[length];
      if (code - count < first) return symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new InflateError('Invalid code');
  };

  const room = (more: number): void => {
    if (written + more <= output.length) return;
    const grown = new Uint8Array(Math.max(output.length * 2, written + more));
    grown.set(output.subarray(0, written));
    output = grown;
  };

  const stored = (): void => {
    bitBuffer = 0; // the rest of the current byte is padding
    bitCount = 0;
    if (position + 4 > input.length) throw new InflateError('Unexpected end of compressed data');
    const length = input[position] | (input[position + 1] << 8);
    const check = input[position + 2] | (input[position + 3] << 8);
    position += 4;
    if (length !== (~check & 0xffff) || position + length > input.length) throw new InflateError('Invalid stored block');
    room(length);
    output.set(input.subarray(position, position + length), written);
    written += length;
    position += length;
  };

  const coded = (literals: Huffman, distances: Huffman): void => {
    for (;;) {
      const code = symbol(literals);
      if (code < 256) {
        room(1);
        output[written++] = code;
      } else if (code === 256) {
        return;
      } else {
        if (code > 285) throw new InflateError('Invalid length code');
        const length = LENGTH_BASE[code - 257] + bits(LENGTH_EXTRA[code - 257]);
        const distanceCode = symbol(distances);
        if (distanceCode > 29) throw new InflateError('Invalid distance code');
        const distance = DISTANCE_BASE[distanceCode] + bits(DISTANCE_EXTRA[distanceCode]);
        if (distance > written) throw new InflateError('Distance reaches before the start');
        room(length);
        // Byte by byte: the copy may run into what it has just written (a repeating pattern).
        for (let i = 0; i < length; i++, written++) output[written] = output[written - distance];
      }
    }
  };

  /** A block's own tables: the code lengths of all its symbols, themselves sent Huffman-coded. */
  const tables = (): [Huffman, Huffman] => {
    const literalCount = bits(5) + 257;
    const distanceCount = bits(5) + 1;
    const codeLengthCount = bits(4) + 4;
    const codeLengths = new Uint8Array(19);
    for (let i = 0; i < codeLengthCount; i++) codeLengths[CODE_LENGTH_ORDER[i]] = bits(3);
    const lengthCodes = huffman(codeLengths);

    const lengths = new Uint8Array(literalCount + distanceCount);
    for (let i = 0; i < lengths.length; ) {
      const code = symbol(lengthCodes);
      if (code < 16) {
        lengths[i++] = code;
        continue;
      }
      // 16: the previous length again, 3–6 times; 17 and 18: a run of zeros.
      if (code === 16 && i === 0) throw new InflateError('Nothing to repeat');
      const value = code === 16 ? lengths[i - 1] : 0;
      const repeat = code === 16 ? 3 + bits(2) : code === 17 ? 3 + bits(3) : 11 + bits(7);
      if (i + repeat > lengths.length) throw new InflateError('Too many code lengths');
      lengths.fill(value, i, i + repeat);
      i += repeat;
    }
    return [huffman(lengths.subarray(0, literalCount)), huffman(lengths.subarray(literalCount))];
  };

  for (let last = false; !last; ) {
    last = bits(1) === 1;
    const type = bits(2);
    if (type === 0) stored();
    else if (type === 1) coded(FIXED_LITERALS, FIXED_DISTANCES);
    else if (type === 2) coded(...tables());
    else throw new InflateError('Invalid block type');
  }
  return output.subarray(0, written);
}
