import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inflate, InflateError } from '../src/infrastructure/parsers/inflate';
import { InvalidZipError, isZip, readZip } from '../src/infrastructure/parsers/zip';
import { zip } from './zipWriter';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('inflate', () => {
  it('unpacks a short text (the standard\'s fixed codes)', () => {
    const packed = deflateRawSync(bytes('hello, hello, hello'));
    expect(text(inflate(packed))).toBe('hello, hello, hello');
  });

  it('unpacks a long, repetitive text (the block\'s own codes, long matches)', () => {
    const original = Array.from({ length: 4000 }, (_, i) => `<note id="${i % 37}"><pitch>${'CDEFGAB'[i % 7]}</pitch></note>`).join('\n');
    const packed = deflateRawSync(bytes(original));
    expect(packed.length).toBeLessThan(original.length / 5);
    expect(text(inflate(packed))).toBe(original);
    expect(text(inflate(packed, original.length))).toBe(original);
  });

  it('unpacks data that does not compress (stored blocks)', () => {
    const original = new Uint8Array(70000).map((_, i) => (i * 7919 + (i >> 3) * 104729) & 0xff);
    expect(inflate(deflateRawSync(original, { level: 0 }))).toEqual(original);
  });

  it('unpacks nothing into nothing', () => {
    expect(inflate(deflateRawSync(new Uint8Array(0)))).toHaveLength(0);
  });

  it('refuses to unpack more than the limit, whatever size is claimed', () => {
    // A megabyte of zeros packs into about a kilobyte.
    const packed = deflateRawSync(new Uint8Array(1_000_000));
    expect(packed.length).toBeLessThan(2000);
    expect(() => inflate(packed, 0, 100_000)).toThrow(/Too large/);
    expect(() => inflate(packed, 1_000_000, 100_000)).toThrow(/Too large/);
    // A claimed size that is too small does not get it past the limit either.
    expect(() => inflate(packed, 10, 100_000)).toThrow(/Too large/);
    expect(inflate(packed, 0, 2_000_000)).toHaveLength(1_000_000);
  });

  it('refuses damaged data', () => {
    const packed = new Uint8Array(deflateRawSync(bytes('some text to pack, some text to pack')));
    expect(() => inflate(packed.subarray(0, packed.length - 4))).toThrow(InflateError);
    expect(() => inflate(new Uint8Array([0x07]))).toThrow(InflateError); // block type 3 does not exist
  });
});

describe('readZip', () => {
  const archive = zip([
    { name: 'a.txt', data: 'packed '.repeat(50) },
    { name: 'folder/b.txt', data: 'as it is', stored: true },
  ]);

  it('lists the files and unpacks each when asked', () => {
    const files = readZip(archive);
    expect([...files.keys()]).toEqual(['a.txt', 'folder/b.txt']);
    expect(text(files.get('a.txt')!())).toBe('packed '.repeat(50));
    expect(text(files.get('folder/b.txt')!())).toBe('as it is');
  });

  it('refuses a file that would unpack beyond any score\'s size', () => {
    const files = readZip(zip([{ name: 'bomb.xml', data: new Uint8Array(70 * 1024 * 1024) }]));
    expect(() => files.get('bomb.xml')!()).toThrow(InvalidZipError);
  });

  it('tells an archive from other files', () => {
    expect(isZip(archive)).toBe(true);
    expect(isZip(bytes('<?xml version="1.0"?>').buffer as ArrayBuffer)).toBe(false);
    expect(() => readZip(bytes('not an archive at all, just some text').buffer as ArrayBuffer)).toThrow(InvalidZipError);
  });
});
