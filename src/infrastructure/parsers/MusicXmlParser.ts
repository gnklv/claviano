import type { ScoreParser } from '../../application/ports/ScoreParser';
import { performNotation } from '../../domain/notation/performance';
import type { Score } from '../../domain/score';
import { PartReader } from './musicxml/PartReader';
import { InvalidMusicXmlError } from './musicxml/xml';
import { pianoPart } from './pianoParts';
import { InvalidZipError, isZip, readZip } from './zip';

export { InvalidMusicXmlError };

/*
 * MusicXML (https://www.w3.org/2021/06/musicxml40/): the notation format of MuseScore, Finale,
 * Sibelius and others. The reader (see the musicxml folder) only takes down what the file says is
 * printed (Notation in the domain); how that is played is the domain's business (performNotation).
 *
 * Plain files (.musicxml, .xml) and compressed ones (.mxl, a ZIP archive with the score inside).
 * Not yet: more than one part (the first one is read; a piano written as
 * two one-staff parts is joined into one, see pianoParts).
 */

export class MusicXmlParser implements ScoreParser {
  canParse(fileName: string): boolean {
    return /\.(musicxml|xml|mxl)$/i.test(fileName);
  }

  parse(data: ArrayBuffer, title: string): Score {
    const xml = new TextDecoder().decode(isZip(data) ? scoreInArchive(data) : data);
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new InvalidMusicXmlError('Not well-formed XML');
    const root = document.documentElement;
    if (root.nodeName === 'score-timewise') {
      throw new InvalidMusicXmlError('Timewise MusicXML is not supported', 'unsupported-feature');
    }
    if (root.nodeName !== 'score-partwise') throw new InvalidMusicXmlError('Not a MusicXML score');

    const part = pianoPart(root);
    if (!part) throw new InvalidMusicXmlError('The score has no parts');
    return performNotation(new PartReader(workTitle(root) ?? title).read(part));
  }
}

/**
 * The score inside a compressed MusicXML file (.mxl): a ZIP archive whose META-INF/container.xml
 * names the score among its files (there may be others: images, a second copy as a PDF…).
 */
function scoreInArchive(data: ArrayBuffer): Uint8Array {
  try {
    const files = readZip(data);
    const container = files.get('META-INF/container.xml');
    const listed = container
      ? new DOMParser()
          .parseFromString(new TextDecoder().decode(container()), 'application/xml')
          .querySelector('rootfile')
          ?.getAttribute('full-path')
      : null;
    // Without a container (it is required, but not every writer knows): the first score-like file.
    const name = listed ?? [...files.keys()].find((file) => /\.(musicxml|xml)$/i.test(file) && !file.startsWith('META-INF/'));
    const score = name ? files.get(name) : undefined;
    if (!score) throw new InvalidMusicXmlError('The archive has no score');
    return score();
  } catch (error) {
    if (error instanceof InvalidZipError) throw new InvalidMusicXmlError(error.message);
    throw error;
  }
}

function workTitle(root: Element): string | null {
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim() || null;
  return text(':scope > work > work-title') ?? text(':scope > movement-title');
}
