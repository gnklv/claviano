import type { ScoreParser } from '../../application/ports/ScoreParser';
import type { Score } from '../../domain/score';

/** Fetches a score from `url` and reads it with `parser`. */
export async function fetchScore(url: string, parser: ScoreParser, title: string): Promise<Score> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parser.parse(await response.arrayBuffer(), title);
}
