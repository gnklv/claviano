import { describe, expect, it } from 'vitest';
import type { Note } from '../src/domain/note';
import type { PedalMark } from '../src/domain/pedal';
import { createScore } from '../src/domain/score';
import { engravePedal as layoutPedal } from '../src/domain/notation/pedalEngraving';

/** Two 4/4 bars of whole notes. Places are beats along the page. */
const notes: Note[] = [0, 4].map((beat) => ({ pitch: 48, start: beat, duration: 4, beat, beats: 4, velocity: 0.8, hand: 'left' }));
const withMarks = (marks: PedalMark[]) => createScore('pedal', notes, [0, 4], { barBeats: [0, 4], pedalMarks: marks });
const signs = { pedal: 'sustain', sign: true, line: false } as const;
const line = { pedal: 'sustain', sign: false, line: true } as const;

describe('layoutPedal', () => {
  it('prints signs as "Ped." at the press and "✱" at the release', () => {
    const layout = layoutPedal(withMarks([{ beat: 0, type: 'start', ...signs }, { beat: 2, type: 'stop', ...signs }]));
    expect(layout.signs).toEqual([
      { beat: 0, kind: 'press' },
      { beat: 2, kind: 'release' },
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
    expect(layout.signs.map((s) => [s.kind, s.beat])).toEqual([
      ['press', 0],
      ['release', 4],
      ['press', 4],
      ['release', 6],
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
    expect(layout.lines).toEqual([{ pedal: 'sustain', from: 0, to: 4, changes: [2], afterSign: false }]);
    expect(layout.signs).toEqual([]);
  });

  it('ends a passage the file leaves open at the next press, or at the end of the music', () => {
    const layout = layoutPedal(withMarks([{ beat: 0, type: 'start', ...line }, { beat: 4, type: 'start', ...line }]));
    expect(layout.lines.map((l) => [l.from, l.to])).toEqual([
      [0, 4],
      [4, 8],
    ]);
  });
});

describe('layoutPedal, middle and left pedals', () => {
  it('keeps each pedal apart: "Sost." and its own line, the soft pedal in words', () => {
    const layout = layoutPedal(
      withMarks([
        { beat: 0, type: 'start', ...line },
        { pedal: 'sostenuto', beat: 2, type: 'start', sign: true, line: true },
        { pedal: 'soft', beat: 2, type: 'start', sign: false, line: false, text: 'una corda' },
        { beat: 4, type: 'stop', ...line },
        { pedal: 'sostenuto', beat: 6, type: 'stop', sign: true, line: true },
        { pedal: 'soft', beat: 6, type: 'stop', sign: false, line: false, text: 'tre corde' },
      ]),
    );
    expect(layout.lines.map((l) => [l.pedal, l.from, l.to, l.afterSign])).toEqual([
      ['sustain', 0, 4, false],
      ['sostenuto', 2, 6, true],
    ]);
    expect(layout.signs).toEqual([{ beat: 2, kind: 'sostenuto' }]);
    expect(layout.words).toEqual([
      { beat: 2, text: 'una corda' },
      { beat: 6, text: 'tre corde' },
    ]);
  });
});
