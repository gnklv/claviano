import type { Notation } from '../../../domain/notation/notation';
import type { UnresolvedPedal } from './pianoPedalLines';

export interface PdfPianoPreview {
  notation: Notation;
  issues: UnresolvedPedal[];
}

export type PdfDocumentReading = PdfPianoPreview & (
  { coverage: 'full'; stoppedAtPage?: never } | { coverage: 'partial'; stoppedAtPage: number }
);

export function documentCoverage(preview: PdfPianoPreview, measures: readonly (readonly unknown[])[], pageCount: number,
  gapPage?: number): PdfDocumentReading {
  let remaining = preview.notation.bars.length;
  for (const [i, page] of measures.entries()) {
    if (gapPage === i + 1 || !page.length || remaining < page.length) {
      return { ...preview, coverage: 'partial', stoppedAtPage: i + 1 };
    }
    remaining -= page.length;
  }
  if (measures.length < pageCount) return { ...preview, coverage: 'partial', stoppedAtPage: measures.length + 1 };
  return { ...preview, coverage: 'full' };
}
