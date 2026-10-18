// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { attributes, note, parser, rest, score } from './musicXmlScore';

describe('MusicXmlParser', () => {
  describe('grace notes', () => {
    const grace = (step: string, octave: number, slash: boolean, extra = '') =>
      `<note><grace${slash ? ' slash="yes"' : ''}/><pitch><step>${step}</step><octave>${octave}</octave></pitch><type>eighth</type><staff>1</staff>${extra}</note>`;
    const sounds = (s: ReturnType<typeof parser.parse>) => s.notes.map((n) => [n.pitch, n.beat, n.beats]);

    it('crushes an acciaccatura in before the beat; the note stays on it', () => {
      const s = parser.parse(score(`<measure number="1">${attributes()}${note('C', 5, 4)}${grace('B', 4, true)}${note('C', 5, 4)}</measure>`), 'test');
      expect(sounds(s)).toEqual([
        [pitch('Do', 5), 0, 2],
        [pitch('Si', 4), 1.875, 0.125],
        [pitch('Do', 5), 2, 2],
      ]);
      expect(s.notation.graces).toMatchObject([{ bar: 0, beat: 2, leadsTo: 1, notes: [{ slash: true, value: 'eighth' }] }]);
      expect(s.graceSounds).toEqual([{ beat: 1.875, each: 0.125 }]);
      // On the page the bar's notes are where they were.
      expect(s.notation.notes.map((n) => n.beat)).toEqual([0, 2]);
    });

    it('gives an appoggiatura half of the note it leads to', () => {
      const s = parser.parse(score(`<measure number="1">${attributes()}${grace('D', 5, false)}${note('C', 5, 8)}</measure>`), 'test');
      expect(sounds(s)).toEqual([
        [pitch('Re', 5), 0, 2],
        [pitch('Do', 5), 2, 2],
      ]);
    });

    it('delays every note of the chord an appoggiatura leads to', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${grace('D', 5, false)}${note('C', 5, 4)}${note('E', 5, 4, { extra: '<chord/>' })}</measure>`),
        'test',
      );
      expect(sounds(s).slice(1)).toEqual([
        [pitch('Do', 5), 1, 1],
        [pitch('Mi', 5), 1, 1],
      ]);
    });

    it('plays several grace notes one after another before the beat, a grace chord together', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${note('C', 5, 4)}
          ${grace('A', 4, false)}${grace('B', 4, false)}${grace('D', 5, false, '<chord/>')}${note('C', 5, 4)}</measure>`),
        'test',
      );
      expect(sounds(s).slice(1, 4)).toEqual([
        [pitch('La', 4), 1.75, 0.125],
        [pitch('Si', 4), 1.875, 0.125],
        [pitch('Re', 5), 1.875, 0.125],
      ]);
      expect(s.notation.graces).toHaveLength(1);
      expect(s.notation.graces[0].notes.map((g) => g.chord)).toEqual([false, false, true]);
    });

    it('plays grace notes at the very start on the beat, and those after a bar\'s last note before the bar line', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${grace('B', 4, true)}${note('C', 5, 8)}${grace('D', 5, true)}</measure>
          <measure number="2">${note('E', 5, 8)}</measure>`),
        'test',
      );
      expect(sounds(s)).toEqual([
        [pitch('Si', 4), 0, 0.125],
        [pitch('Do', 5), 0.125, 3.875],
        [pitch('Re', 5), 3.875, 0.125],
        [pitch('Mi', 5), 4, 4],
      ]);
      expect(s.notation.graces.map((g) => [g.bar, g.beat])).toEqual([
        [0, 0],
        [0, 4],
      ]);
    });

    it('lays them out before the chord they lead to', () => {
      const s = parser.parse(score(`<measure number="1">${attributes()}${note('C', 5, 4)}${grace('B', 4, true)}${note('C', 5, 4)}</measure>`), 'test');
      const layout = layoutNotation(s);
      expect(layout.graces).toHaveLength(1);
      expect(layout.graces[0]).toMatchObject({ staff: 'treble', principal: 1, slash: true, beams: 1, beat: 1.875, beats: 0.125 });
    });
  });

  describe('ornaments', () => {
    const ornamented = (step: string, octave: number, duration: number, ornaments: string, extra = '') =>
      note(step, octave, duration, { extra: `${extra}<notations><ornaments>${ornaments}</ornaments></notations>` });
    const sounds = (s: ReturnType<typeof parser.parse>) => s.notes.map((n) => [n.pitch, n.beat, n.beats]);

    it('plays a trill with the note above in the key, and keeps the printed note whole', () => {
      // Two sharps: the note above B is C sharp.
      const s = parser.parse(score(`<measure number="1">${attributes(2, 2)}${ornamented('B', 4, 2, '<trill-mark/>')}${rest(6)}</measure>`), 'test');
      const [b, cSharp] = [pitch('Si', 4), pitch('Do#', 5)];
      expect(s.notes.map((n) => n.pitch)).toEqual([b, cSharp, b, cSharp, b, cSharp, b]);
      expect(s.notes[6]).toMatchObject({ beat: 0.75, beats: 0.25 });
      expect(s.notation.notes).toHaveLength(1);
      expect(s.notation.notes[0]).toMatchObject({ beats: 1, ornaments: [{ kind: 'trill' }], trillLine: false });
    });

    it('follows the accidental printed with the sign', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${ornamented('C', 5, 2, '<inverted-mordent/><accidental-mark placement="above">flat</accidental-mark>')}${rest(6)}</measure>`),
        'test',
      );
      expect(s.notes.map((n) => n.pitch)).toEqual([pitch('Do', 5), pitch('Reb', 5), pitch('Do', 5)]);
      expect(s.notation.notes[0].ornaments[0]).toMatchObject({ kind: 'inverted-mordent', accidentalAbove: 'flat' });
    });

    it('repeats a note with tremolo strokes on its stem', () => {
      const s = parser.parse(score(`<measure number="1">${attributes()}${ornamented('C', 5, 4, '<tremolo type="single">2</tremolo>')}${rest(4)}</measure>`), 'test');
      expect(sounds(s)).toEqual(Array.from({ length: 8 }, (_, i) => [pitch('Do', 5), i * 0.25, 0.25]));
      expect(s.notation.notes[0].tremolo).toEqual({ type: 'single', strokes: 2 });
    });

    it('plays the two notes of a tremolo in turn over both their lengths', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}
          ${ornamented('C', 5, 2, '<tremolo type="start">1</tremolo>')}${ornamented('E', 5, 2, '<tremolo type="stop">1</tremolo>')}${rest(4)}</measure>`),
        'test',
      );
      expect(sounds(s)).toEqual([
        [pitch('Do', 5), 0, 0.5],
        [pitch('Mi', 5), 0.5, 0.5],
        [pitch('Do', 5), 1, 0.5],
        [pitch('Mi', 5), 1.5, 0.5],
      ]);
    });

    it('rolls a chord from the bottom up through both hands, each note held to the end', () => {
      const roll = '<notations><arpeggiate/></notations>';
      const s = parser.parse(
        score(`<measure number="1">${attributes()}
          ${note('E', 4, 8, { extra: roll })}${note('G', 4, 8, { extra: `<chord/>${roll}` })}
          <backup><duration>8</duration></backup>${note('C', 3, 8, { staff: 2, extra: roll })}</measure>`),
        'test',
      );
      expect(sounds(s)).toEqual([
        [pitch('Do', 3), 0, 4],
        [pitch('Mi', 4), 0.0625, 3.9375],
        [pitch('Sol', 4), 0.125, 3.875],
      ]);
      expect(layoutNotation(s).arpeggios).toEqual([{ chords: [0, 1], down: false }]);
    });

    it('rolls a chord from the top down when the sign says so', () => {
      const roll = '<notations><arpeggiate direction="down"/></notations>';
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${note('E', 4, 8, { extra: roll })}${note('G', 4, 8, { extra: `<chord/>${roll}` })}</measure>`),
        'test',
      );
      expect(s.notes.map((n) => [n.pitch, n.beat])).toEqual([
        [pitch('Sol', 4), 0],
        [pitch('Mi', 4), 0.0625],
      ]);
    });

    it('lays the signs out over their chords, a delayed turn after its note', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}
          ${ornamented('C', 5, 4, '<trill-mark/><wavy-line type="start"/><wavy-line type="stop"/>')}${ornamented('C', 5, 4, '<delayed-turn/>')}</measure>`),
        'test',
      );
      const layout = layoutNotation(s);
      expect(layout.ornaments.map((o) => [o.chord, o.kind, o.above])).toEqual([
        [0, 'trill', true],
        [1, 'delayed-turn', true],
      ]);
      // The trill's line runs to the end of its note; the turn stands halfway through its own.
      expect(layout.ornaments[0].lineTo).toBeCloseTo(layout.chords[1].beat);
      expect(layout.ornaments[1].beat).toBe(layout.chords[1].beat + 1);
      // Over the staff, clear of the notes.
      expect(layout.ornaments[0].step).toBeLessThanOrEqual(-3);
    });
  });

});
