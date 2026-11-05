import type { ScoreWriter } from '../ports/ScoreWriter';
import type { Library } from './Library';
import type { Recorder } from './Recorder';

/**
 * A take kept as a piece: written out as a file, put on the shelf under `title`, and opened, to be
 * learned as any other. Only a saved take is done with; a later take stays.
 * Returns whether the take was kept and, unless replaced meanwhile, opened.
 */
export async function keepTake(recorder: Recorder, writer: ScoreWriter, library: Library, title: string, fileName: string): Promise<boolean> {
  const notes = recorder.take?.notes;
  const score = recorder.score(title);
  if (!score) return false;
  recorder.stopListening();
  const id = await library.keepFile(`${fileName}${writer.extension}`, writer.write(score), title);
  if (id === null) return false;
  // A later take is still being worked on: the saved one must not replace it.
  if (recorder.take?.notes !== notes) return true;
  await library.open(id);
  if (library.current !== id) return false;
  if (recorder.take?.notes === notes) recorder.discard();
  return true;
}
