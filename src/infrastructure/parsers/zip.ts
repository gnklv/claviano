import { inflate, InflateError } from './inflate';

/*
 * A ZIP archive reader, enough for compressed MusicXML (.mxl): files stored as they are or packed
 * with Deflate. The archive ends with a directory of its files; each entry says where the file's
 * data is and how it is packed.
 */

export class InvalidZipError extends Error {}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
/** Bit 0 of an entry's flags: the file is encrypted. */
const ENCRYPTED = 1;

/** True if `data` begins like a ZIP archive. */
export function isZip(data: ArrayBuffer): boolean {
  return data.byteLength >= 4 && new DataView(data).getUint32(0, true) === LOCAL_HEADER;
}

/** The files of an archive by name; each is unpacked when it is asked for. */
export function readZip(data: ArrayBuffer): Map<string, () => Uint8Array> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  // The directory's end record is the last thing in the file, but for a comment of any length.
  let end = data.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
  if (end < 0) throw new InvalidZipError('Not a ZIP archive');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);

  const files = new Map<string, () => Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== DIRECTORY_ENTRY) {
      throw new InvalidZipError('Broken ZIP directory');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const packedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const header = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    files.set(name, () => {
      if (flags & ENCRYPTED) throw new InvalidZipError(`${name} is encrypted`);
      if (header + 30 > data.byteLength || view.getUint32(header, true) !== LOCAL_HEADER) {
        throw new InvalidZipError(`${name}: broken ZIP entry`);
      }
      // The file's data follows its own header, whose name and extra field may differ in length from the directory's.
      const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
      if (start + packedSize > data.byteLength) throw new InvalidZipError(`${name}: broken ZIP entry`);
      const packed = bytes.subarray(start, start + packedSize);
      if (method === STORED) return packed;
      if (method !== DEFLATED) throw new InvalidZipError(`${name}: unsupported compression`);
      try {
        return inflate(packed, size);
      } catch (error) {
        if (error instanceof InflateError) throw new InvalidZipError(`${name}: ${error.message}`);
        throw error;
      }
    });
  }
  return files;
}
