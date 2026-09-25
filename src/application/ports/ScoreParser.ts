import type { Score } from '../../domain/score';

export interface ScoreParser {
  canParse(fileName: string): boolean;
  parse(data: ArrayBuffer, title: string): Score;
}
