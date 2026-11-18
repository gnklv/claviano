import { ScoreLoadError, type ScoreParser } from '../../application/ports/ScoreParser';
import { performNotation } from '../../domain/notation/performance';
import type { Score } from '../../domain/score';
import { readPdf } from './pdf/document';
import { readPianoDocumentPreview } from './pdf/pianoPreview';

export class PdfScoreParser implements ScoreParser {
  canParse(fileName: string): boolean {
    return /\.pdf$/i.test(fileName);
  }

  parse(data: ArrayBuffer, title: string): Score {
    const document = readPdf(new Uint8Array(data));
    const result = readPianoDocumentPreview(document, title);
    if (!result) throw new ScoreLoadError('unsupported-pdf', 'No supported piano notation was found');
    if (result.coverage === 'partial') {
      throw new ScoreLoadError('incomplete-score', 'Only part of the score could be read', result.stoppedAtPage);
    }
    return performNotation(result.notation);
  }
}
