import { ScoreLoadError } from '../../../application/ports/ScoreParser';

/* Small helpers for reading MusicXML elements. */

export class InvalidMusicXmlError extends ScoreLoadError {
  constructor(message: string, code: 'invalid-file' | 'unsupported-feature' = 'invalid-file') {
    super(code, message);
    this.name = 'InvalidMusicXmlError';
  }
}

export const childText = (element: Element, name: string): string | null =>
  element.querySelector(`:scope > ${name}`)?.textContent?.trim() ?? null;

export const childNumber = (element: Element, name: string): number | null => {
  const text = childText(element, name);
  return text === null || text === '' ? null : Number(text);
};
