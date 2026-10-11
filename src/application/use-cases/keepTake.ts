import type { ScoreWriter } from '../ports/ScoreWriter';
import type { Library } from './Library';
import type { Recorder } from './Recorder';

/**
 * A take kept as a piece: written out as a file, put on the shelf under `title`, and opened, to be
 * learned as any other. The take itself is done with. Nothing happens when there is no take.
 */
export async function keepTake(recorder: Recorder, writer: ScoreWriter, library: Library, title: string, fileName: string): Promise<void> {
  const score = recorder.score(title);
  if (!score) return;
  recorder.stopListening();
  await library.openFile(`${fileName}${writer.extension}`, writer.write(score), title);
  recorder.discard();
}
