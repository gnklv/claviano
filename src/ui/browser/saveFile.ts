/** Hands a file to the browser to save, under `name`: as a download. */
export function saveFile(name: string, data: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // (Not at once: the browser may not have begun to read it yet.)
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
