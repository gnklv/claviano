import { describe, expect, it } from 'vitest';
import type { Note } from '../src/domain/note';
import type { PedalMark } from '../src/domain/pedal';
import { createScore } from '../src/domain/score';
import { layoutPedal } from '../src/infrastructure/render/pedalLayout';

/** Two 4/4 bars of whole notes: on the tape, beat 4 is x = 1 and beat 8 is x = 2. */
const notes: Note[] = [0, 4].map((beat) => ({ pitch: 48, start: beat, duration: 4, beat, beats: 4, velocity: 0.8, hand: 'left' }));
const withMarks = (marks: PedalMark[]) => createScore('pedal', notes, [0, 4], { barBeats: [0, 4], pedalMarks: marks });
const signs = { sign: true, line: false };
const line = { sign: false, line: true };

describe('layoutPedal', () => {
  it('prints signs as "Ped." at the press and "✱" at the release', () => {
    const layout = layoutPedal(withMarks([{ beat: 0, type: 'start', ...signs }, { beat: 2, type: 'stop', ...signs }]));
    expect(layout.signs).toEqual([
      { x: 0, kind: 'press' },
      { x: 0.5, kind: 'release' },
    ]);
    expect(layout.lines).toEqual([]);
  });

  it('prints a change with signs as a release and a new press', () => {
    const layout = layoutPedal(
      withMarks([
        { beat: 0, type: 'start', ...signs },
        { beat: 4, type: 'change', ...signs },
        { beat: 6, type: 'stop', ...signs },
      ]),
    );
    expect(layout.signs.map((s) => [s.kind, s.x])).toEqual([
      ['press', 0],
      ['release', 1],
      ['press', 1],
      ['release', 1.5],
    ]);
  });

  it('draws a line with a notch at each change', () => {
    const layout = layoutPedal(
      withMarks([
        { beat: 0, type: 'start', ...line },
        { beat: 2, type: 'change', ...line },
        { beat: 4, type: 'stop', ...line },
      ]),
    );
    expect(layout.lines).toEqual([{ from: 0, to: 1, changes: [0.5], afterSign: false }]);
    expect(layout.signs).toEqual([]);
  });

  it('ends a passage the file leaves open at the next press, or at the end of the music', () => {
    const layout = layoutPedal(withMarks([{ beat: 0, type: 'start', ...line }, { beat: 4, type: 'start', ...line }]));
    expect(layout.lines.map((l) => [l.from, l.to])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});
