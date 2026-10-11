import type { Score } from '../../domain/score';

/** Writes a piece out as a file of some format: what was played here, to keep and to open elsewhere. */
export interface ScoreWriter {
  /** The file's extension, with its dot: ".mid". */
  readonly extension: string;
  write(score: Score): ArrayBuffer;
}
