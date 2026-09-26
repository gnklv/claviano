import type { Score } from '../../domain/score';

export interface ScoreParser {
  canParse(fileName: string): boolean;
  parse(data: ArrayBuffer, title: string): Score;
}

/** Why a score could not be loaded; the UI turns the code into a message in the user's language. */
export type ScoreLoadErrorCode = 'unsupported-format' | 'invalid-file' | 'unsupported-feature';

export class ScoreLoadError extends Error {
  constructor(
    readonly code: ScoreLoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScoreLoadError';
  }
}
