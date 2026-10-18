// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { attributes, note, parser, score, tempo } from './musicXmlScore';

describe('MusicXmlParser', () => {
  describe('clefs with an 8', () => {
    const clef = (sign: string, line: number, octaves?: number) =>
      `<attributes><clef number="1"><sign>${sign}</sign><line>${line}</line>${octaves === undefined ? '' : `<clef-octave-change>${octaves}</clef-octave-change>`}</clef></attributes>`;

    it('prints the notes an octave from where they sound, and says so with the clef', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${clef('G', 2, 1)}${note('C', 6, 4)}${clef('G', 2)}${note('C', 6, 4)}</measure>`),
        'test',
      );
      expect(s.notes.map((n) => n.pitch)).toEqual([84, 84]);
      expect(s.notation.notes.map((n) => n.pitch.octave)).toEqual([5, 6]);
      expect(s.notation.clefs.filter((c) => c.staff === 1).map((c) => [c.beat, c.clef, c.octaves ?? 0])).toEqual([
        [0, 'treble', 1],
        [2, 'treble', 0],
      ]);
    });

    it('prints notes higher under a clef with an 8 below it, and adds up with an 8va bracket', () => {
      const shift = (type: string) => `<direction><direction-type><octave-shift type="${type}" size="8"/></direction-type></direction>`;
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${clef('G', 2, -1)}${note('C', 3, 4)}${clef('G', 2, 1)}${shift('down')}${note('C', 7, 4)}${shift('stop')}</measure>`),
        'test',
      );
      expect(s.notes.map((n) => n.pitch)).toEqual([48, 96]);
      // Do3 under the low clef is printed as Do4; Do7 in the high clef under 8va, as Do5.
      expect(s.notation.notes.map((n) => n.pitch.octave)).toEqual([4, 5]);
    });
  });

  it('reads cue-size notes as small, and plays them as any others', () => {
    const small = note('E', 4, 4).replace('</note>', '<type size="cue">quarter</type></note>');
    const s = parser.parse(score(`<measure number="1">${attributes()}${note('C', 4, 4, { extra: '<type>quarter</type>' })}${small}</measure>`), 'test');
    expect(s.notation.notes.map((n) => n.small ?? false)).toEqual([false, true]);
    expect(s.notes.map((n) => [n.pitch, n.velocity])).toEqual([
      [60, s.notes[0].velocity],
      [64, s.notes[0].velocity],
    ]);
    expect(layoutNotation(s).chords.map((c) => c.small ?? false)).toEqual([false, true]);
  });

  describe('what the engraver hid', () => {
    it('plays a hidden note and prints nothing for it', () => {
      const hidden = note('E', 4, 2).replace('<note', '<note print-object="no"');
      const s = parser.parse(score(`<measure number="1">${attributes()}${note('C', 4, 2)}${hidden}${note('G', 4, 4)}</measure>`), 'test');
      expect(s.notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
      expect(s.notation.notes.map((n) => n.hidden ?? false)).toEqual([false, true, false]);
      expect(layoutNotation(s).chords.map((c) => c.beat)).toEqual([0, 1, 2].filter((beat) => beat !== 1));
    });

    it('keeps the rest of a chord on its stem when the first note of the chord is hidden', () => {
      const hidden = note('C', 4, 4).replace('<note', '<note print-object="no"');
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${hidden}${note('E', 4, 4, { extra: '<chord/>' })}${note('G', 4, 4, { extra: '<chord/>' })}${note('C', 5, 4)}</measure>`),
        'test',
      );
      expect(s.notes.map((n) => n.pitch).sort()).toEqual([60, 64, 67, 72]);
      const chords = layoutNotation(s).chords;
      expect(chords.map((c) => c.notes.length)).toEqual([2, 1]);
      expect(chords[0].beat).toBe(0);
    });

    it('skips a hidden rest but keeps its time', () => {
      const hiddenRest = '<note print-object="no"><rest/><duration>2</duration><voice>1</voice><type>quarter</type></note>';
      const s = parser.parse(score(`<measure number="1">${attributes()}${hiddenRest}${note('E', 4, 2)}${note('G', 4, 4)}</measure>`), 'test');
      expect(s.notation.rests).toEqual([]);
      expect(s.notation.notes.map((n) => n.beat)).toEqual([1, 2]);
    });

    it('reads a note without a head, which still sounds', () => {
      const headless = note('C', 4, 4, { extra: '<notehead>none</notehead>' });
      const s = parser.parse(score(`<measure number="1">${attributes()}${headless}${note('E', 4, 4)}</measure>`), 'test');
      expect(s.notation.notes.map((n) => n.headless ?? false)).toEqual([true, false]);
      expect(s.notes.map((n) => n.pitch)).toEqual([60, 64]);
      expect(layoutNotation(s).chords.map((c) => c.notes[0].headless ?? false)).toEqual([true, false]);
    });
  });

  describe('pedals', () => {
    const pedal = (type: string, attrs = '', offset = '') =>
      `<direction placement="below"><direction-type><pedal type="${type}" ${attrs}/></direction-type>${offset}</direction>`;
    const quarter = (step: string, octave = 3) => note(step, octave, 2, { staff: 2, extra: '<type>quarter</type>' });

    it('reads printed pedal marks as spans for playback and marks for the staff', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('start')}${quarter('C')}${quarter('E')}${pedal('change', 'line="yes"')}${quarter('G')}${quarter('C', 4)}${pedal('stop')}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ]);
      expect(s.notation.pedalMarks).toEqual([
        { pedal: 'sustain', beat: 0, type: 'start', sign: true, line: false },
        { pedal: 'sustain', beat: 2, type: 'change', sign: false, line: true },
        { pedal: 'sustain', beat: 4, type: 'stop', sign: true, line: false },
      ]);
    });

    it('reads "resume" with nothing before it as a press: "Ped." and a line, as MuseScore 4 writes them', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('resume', 'line="yes" sign="yes"')}${quarter('C')}${quarter('E')}${pedal('stop', 'line="yes" sign="no"')}
          ${pedal('resume', 'line="yes" sign="yes"')}${quarter('G')}${quarter('C', 4)}${pedal('stop', 'line="yes" sign="no"')}</measure>`),
        't',
      );
      expect(s.pedal).toEqual([
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ]);
      expect(s.notation.pedalMarks).toEqual([
        { pedal: 'sustain', beat: 0, type: 'start', sign: true, line: true },
        { pedal: 'sustain', beat: 2, type: 'stop', sign: false, line: true },
        { pedal: 'sustain', beat: 2, type: 'start', sign: true, line: true },
        { pedal: 'sustain', beat: 4, type: 'stop', sign: false, line: true },
      ]);
    });

    it('lets a pedal line broken off and taken up again run on as one', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('start', 'line="yes"')}${quarter('C')}${pedal('discontinue', 'line="yes"')}${quarter('E')}${pedal('resume', 'line="yes"')}${quarter('G')}${quarter('C', 4)}${pedal('stop', 'line="yes"')}</measure>`),
        't',
      );
      expect(s.notation.pedalMarks.map((m) => [m.type, m.beat])).toEqual([
        ['start', 0],
        ['stop', 4],
      ]);
    });

    it('places a pedal mark by its offset', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('start', '', '<offset>2</offset>')}${quarter('C')}${quarter('E')}${pedal('stop')}${quarter('G')}${quarter('C', 4)}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([{ start: 1, end: 2 }]);
    });

    it('plays a bare <sound damper-pedal> without printing anything', () => {
      const damper = (value: string) => `<sound damper-pedal="${value}"/>`;
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${damper('yes')}${quarter('C')}${quarter('E')}${damper('no')}${quarter('G')}${quarter('C', 4)}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([{ start: 0, end: 2 }]);
      expect(s.notation.pedalMarks).toEqual([]);
    });

    it('does not let the stop of a middle (sostenuto) pedal lift the sustain pedal', () => {
      // Sustain down on beat 0; sostenuto from beat 1 to 2 (its end is a plain "stop", which lifts the
      // pedal pressed last); sustain up on 4.
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('start')}${quarter('C')}${pedal('sostenuto')}${quarter('E')}${pedal('stop')}${quarter('G')}${quarter('C', 4)}${pedal('stop')}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([{ start: 0, end: 4 }]);
      expect(s.sostenutoPedal).toEqual([{ start: 1, end: 2 }]);
      expect(s.notation.pedalMarks.map((m) => [m.pedal, m.type, m.beat])).toEqual([
        ['sustain', 'start', 0],
        ['sostenuto', 'start', 1],
        ['sostenuto', 'stop', 2],
        ['sustain', 'stop', 4],
      ]);
    });

    it('tells overlapping pedals apart by their number', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${pedal('sostenuto', 'number="2"')}${quarter('C')}${pedal('start', 'number="1"')}${quarter('E')}${pedal('stop', 'number="2"')}${quarter('G')}${pedal('stop', 'number="1"')}${quarter('C', 4)}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([{ start: 1, end: 3 }]);
      expect(s.sostenutoPedal).toEqual([{ start: 0, end: 2 }]);
    });

    it('reads the soft pedal from "una corda" and "tre corde", and from <sound soft-pedal>', () => {
      const words = (text: string) => `<direction><direction-type><words>${text}</words></direction-type></direction>`;
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${words('una corda')}${quarter('C')}${quarter('E')}${words('tre corde')}${quarter('G')}<sound soft-pedal="yes"/>${quarter('C', 4)}</measure>`),
        'test',
      );
      expect(s.softPedal).toEqual([
        { start: 0, end: 2 },
        { start: 3, end: 4 },
      ]);
      expect(s.notation.pedalMarks.map((m) => [m.pedal, m.type, m.text])).toEqual([
        ['soft', 'start', 'una corda'],
        ['soft', 'stop', 'tre corde'],
      ]);
    });

    it('presses the pedal again on every pass of a repeat', () => {
      const repeatStart = '<barline location="left"><repeat direction="forward"/></barline>';
      const repeatEnd = '<barline location="right"><repeat direction="backward"/></barline>';
      const s = parser.parse(
        score(`<measure number="1">${repeatStart}${attributes()}${tempo(60)}
          ${pedal('start')}${quarter('C')}${quarter('E')}${quarter('G')}${quarter('C', 4)}${pedal('stop')}${repeatEnd}</measure>`),
        'test',
      );
      expect(s.pedal).toEqual([
        { start: 0, end: 4 },
        { start: 4, end: 8 },
      ]);
      expect(s.notation.pedalMarks).toHaveLength(2); // printed once
    });
  });
});
