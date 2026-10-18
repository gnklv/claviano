import { describe, expect, it } from 'vitest';
import { handsByLine } from '../src/domain/note';

/* Which hand plays a note, where the notes come in lines and nothing says whose a line is. */

describe('the hands of notes in lines', () => {
  it('gives the higher of two lines to the right hand, whichever comes first', () => {
    const notes = [
      { pitch: 48, line: 0 },
      { pitch: 72, line: 1 },
      { pitch: 50, line: 0 },
      // (A note of the higher line low down is still the right hand's: the line is the hand.)
      { pitch: 55, line: 1 },
    ];
    expect(handsByLine(notes)).toEqual(['left', 'right', 'left', 'right']);
    expect(handsByLine(notes.map((note) => ({ ...note, line: 1 - note.line })))).toEqual(['left', 'right', 'left', 'right']);
  });

  it('shares one line out by pitch, from middle Do up to the right hand', () => {
    expect(handsByLine([59, 60, 72, 40].map((pitch) => ({ pitch, line: 0 })))).toEqual(['left', 'right', 'right', 'left']);
  });

  it('shares more than two lines out by pitch: they are not two hands', () => {
    expect(handsByLine([{ pitch: 48, line: 0 }, { pitch: 64, line: 1 }, { pitch: 55, line: 2 }])).toEqual(['left', 'right', 'left']);
  });
});
