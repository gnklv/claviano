/**
 * A name for a file by what is in it: the same bytes give the same name, whatever the file is
 * called. Short, and good for telling a shelf of pieces apart; not a cryptographic hash. (Worked
 * out here rather than asked of the browser: its own hashing is not there on a plain http page.)
 */
export function contentId(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  // Two 32-bit hashes run side by side and mixed at the end (cyrb53), with the length beside them.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${bytes.length.toString(36)}-${hash.toString(36)}`;
}
