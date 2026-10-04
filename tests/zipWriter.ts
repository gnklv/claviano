import { deflateRawSync } from 'node:zlib';

/** A tiny ZIP writer for tests: files packed with Deflate (by Node), or stored as they are. */
export function zip(files: { name: string; data: string | Uint8Array; stored?: boolean }[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const local: number[] = [];
  const directory: number[] = [];
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const packed = file.stored ? data : new Uint8Array(deflateRawSync(data));
    // Version, flags, method, time, date, CRC (not checked by the reader), sizes, name and extra lengths.
    const fields = [...u16(20), ...u16(0), ...u16(file.stored ? 0 : 8), ...u16(0), ...u16(0), ...u32(0), ...u32(packed.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    directory.push(...u32(0x02014b50), ...u16(20), ...fields, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(local.length), ...name);
    local.push(...u32(0x04034b50), ...fields, ...name, ...packed);
  }
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(directory.length), ...u32(local.length), ...u16(0)];
  return new Uint8Array([...local, ...directory, ...end]).buffer;
}
