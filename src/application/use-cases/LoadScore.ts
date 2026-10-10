import type { Score } from '../../domain/score';
import { ScoreLoadError, type ScoreParser } from '../ports/ScoreParser';

export class UnsupportedFormatError extends ScoreLoadError {
  constructor(fileName: string) {
    super('unsupported-format', `Unsupported file format: ${fileName}`);
    this.name = 'UnsupportedFormatError';
  }
}

/** A file's name as a title, for a piece that has none of its own: no extension, spaces for underscores. */
export const titleFromFileName = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .trim();

export class LoadScore {
  constructor(private readonly parsers: readonly ScoreParser[]) {}

  execute(fileName: string, data: ArrayBuffer): Score {
    const parser = this.parsers.find((p) => p.canParse(fileName));
    if (!parser) throw new UnsupportedFormatError(fileName);
    return parser.parse(data, titleFromFileName(fileName));
  }
}
