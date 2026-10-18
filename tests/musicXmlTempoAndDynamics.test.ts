// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { attributes, note, parser, rest, score, tempo } from './musicXmlScore';

describe('MusicXmlParser', () => {
  describe('tempo marks', () => {
    const metronome = (unit: string, dot: boolean, perMinute: string, sound = '') =>
      `<direction><direction-type><metronome><beat-unit>${unit}</beat-unit>${dot ? '<beat-unit-dot/>' : ''}<per-minute>${perMinute}</per-minute></metronome></direction-type>${sound}</direction>`;

    it('reads a printed metronome mark with its unit, and a bare tempo in quarters', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${metronome('quarter', true, '60', '<sound tempo="90"/>')}${note('C', 4, 8)}</measure>
          <measure number="2">${tempo(120)}${note('D', 4, 8)}</measure>`),
        'test',
      );
      expect(s.notation.tempoMarks).toEqual([
        { beat: 0, unit: { value: 'quarter', dots: 1 }, perMinute: 60 },
        { beat: 4, unit: { value: 'quarter', dots: 0 }, perMinute: 120 },
      ]);
    });

    it('prefers the printed mark at one place, reads "c. 60", and drops restatements', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(90)}${metronome('half', false, 'c. 45')}${note('C', 4, 8)}</measure>
          <measure number="2">${metronome('half', false, '45')}${note('D', 4, 8)}</measure>`),
        'test',
      );
      expect(s.notation.tempoMarks).toEqual([{ beat: 0, unit: { value: 'half', dots: 0 }, perMinute: 45 }]);
    });
  });

  it('prints notes under an octave shift an octave nearer, sounding as written in the file', () => {
    const shift = (type: string) => `<direction><direction-type><octave-shift type="${type}" size="8"/></direction-type><staff>1</staff></direction>`;
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${shift('down')}${note('C', 7, 4)}${shift('stop')}${note('C', 5, 4)}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => n.pitch)).toEqual([pitch('Do', 7), pitch('Do', 5)]);
    expect(s.notation.notes.map((n) => n.pitch.octave)).toEqual([6, 5]);
    expect(s.notation.octaveShifts).toEqual([{ staff: 1, start: 0, end: 2, octaves: 1 }]);
  });

  it('points all stems of a beamed group on one staff the same way when the file does not say', () => {
    // G4 A♭4 B♭4 on the treble staff: alone, the lower notes would take stems up and B♭4 down.
    const eighth = (step: string, alter: number, beam: string) =>
      note(step, 4, 1, { alter, extra: `<type>eighth</type><beam number="1">${beam}</beam>` });
    const s = parser.parse(
      score(`<measure number="1">${attributes(2, -3, 3)}${eighth('G', 0, 'begin')}${eighth('A', -1, 'continue')}${eighth('B', -1, 'end')}${rest(3)}</measure>`),
      'test',
    );
    const layout = layoutNotation(s);
    const beamed = layout.beams[0].chords.map((i) => layout.chords[i].stemUp);
    expect(new Set(beamed).size).toBe(1);
    expect(beamed[0]).toBe(layout.beams[0].stemUp);
  });

  it('tells apart voices numbered per staff (voice 1 on both staves at once)', () => {
    const eighth = (step: string, octave: number, staff: number, beam: string) =>
      note(step, octave, 1, { staff, extra: `<voice>1</voice><type>eighth</type><beam number="1">${beam}</beam>` });
    // Each hand plays two beamed eighths per beat, both written as voice 1.
    const upper = [0, 1].map(() => eighth('C', 5, 1, 'begin') + eighth('D', 5, 1, 'end')).join('');
    const lower = [0, 1].map(() => eighth('C', 3, 2, 'begin') + eighth('D', 3, 2, 'end')).join('');
    const s = parser.parse(score(`<measure number="1">${attributes(2, 0, 2)}${upper}<backup><duration>4</duration></backup>${lower}</measure>`), 'test');
    const layout = layoutNotation(s);
    expect(layout.beams).toHaveLength(4);
    for (const beam of layout.beams) expect(new Set(beam.chords.map((i) => layout.chords[i].staff)).size).toBe(1);
  });

  it('keeps a beamed group together when its voice crosses to the other staff', () => {
    // As in the Moonlight Sonata: each triplet starts in the bass and goes on in the treble, one voice.
    const eighth = (step: string, octave: number, staff: number, beam: string, stem: string) =>
      note(step, octave, 1, { staff, extra: `<voice>1</voice><type>eighth</type><stem>${stem}</stem><beam number="1">${beam}</beam>` });
    const group = eighth('G', 3, 2, 'begin', 'up') + eighth('E', 4, 1, 'continue', 'down') + eighth('C', 4, 1, 'end', 'down');
    const s = parser.parse(
      score(`<measure number="1">${attributes(2, 0, 3)}${group}${group}${group}</measure>
        <measure number="2">${group}${group}${group}</measure>`),
      'test',
    );
    const layout = layoutNotation(s);
    expect(layout.beams).toHaveLength(6);
    for (const beam of layout.beams) {
      const chords = beam.chords.map((i) => layout.chords[i]);
      expect(chords.map((c) => c.staff)).toEqual(['bass', 'treble', 'treble']);
      expect(new Set(chords.map((c) => c.bar)).size).toBe(1); // never across a bar line
    }
  });

  describe('dynamics', () => {
    const mark = (m: string) => `<direction><direction-type><dynamics><${m}/></dynamics></direction-type></direction>`;
    const wedge = (type: string) => `<direction><direction-type><wedge type="${type}"/></direction-type></direction>`;

    it('reads marks, and sets the loudness from them when the file gives no <sound dynamics>', () => {
      const s = parser.parse(score(`<measure number="1">${attributes()}${mark('p')}${note('C', 4, 4)}${mark('ff')}${note('D', 4, 4)}</measure>`), 'test');
      expect(s.notation.dynamics.map((d) => [d.text, d.beat, d.letters])).toEqual([
        ['p', 0, true],
        ['ff', 2, true],
      ]);
      expect(s.notes[1].velocity).toBeGreaterThan(s.notes[0].velocity);
    });

    it('stresses the note under sfz, and plays fp loud then soft', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${mark('p')}${note('C', 4, 2)}${mark('sfz')}${note('D', 4, 2)}${note('E', 4, 2)}${mark('fp')}${note('F', 4, 1)}${note('G', 4, 1)}</measure>`),
        'test',
      );
      const [before, stressed, after, fp, afterFp] = s.notes.map((n) => n.velocity);
      expect(stressed).toBeGreaterThan(before);
      expect(after).toBeCloseTo(before); // sfz changes one note, not the level
      expect(fp).toBeGreaterThan(before); // forte…
      expect(afterFp).toBeCloseTo(before); // …then piano
    });

    it('reads a hairpin from its start to its stop, and "cresc." as words that sound like one', () => {
      const words = '<direction><direction-type><words>cresc.</words></direction-type></direction>';
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${mark('p')}${wedge('crescendo')}${note('C', 4, 2)}${note('D', 4, 2)}${wedge('stop')}${mark('f')}${note('E', 4, 2)}${words}${note('F', 4, 2)}</measure>`),
        'test',
      );
      expect(s.notation.hairpins).toEqual([{ start: 0, end: 2, type: 'crescendo', below: false, drawn: true }]);
      expect(s.notation.dynamics.map((d) => [d.text, d.letters])).toEqual([
        ['p', true],
        ['f', true],
        ['cresc.', false],
      ]);
      const [first, second, third] = s.notes.map((n) => n.velocity);
      expect(second).toBeGreaterThan(first); // rising towards the f
      expect(third).toBeGreaterThan(second);
    });
  });

  it('plays chord notes together', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}
        ${note('C', 4, 8)}${note('E', 4, 8, { extra: '<chord/>' })}${note('G', 4, 8, { extra: '<chord/>' })}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => n.beat)).toEqual([0, 0, 0]);
  });

  it('reads the second staff as the left hand, going back in time with <backup>', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}
        ${note('C', 5, 8)}<backup><duration>8</duration></backup>${note('C', 3, 8, { staff: 2 })}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => [n.pitch, n.hand, n.beat])).toEqual([
      [pitch('Do', 3), 'left', 0],
      [pitch('Do', 5), 'right', 0],
    ]);
  });

  it('turns tied notes into one sounding note, across a bar line', () => {
    const s = parser.parse(
      score(`
        <measure number="1">${attributes()}${rest(6)}${note('G', 4, 2, { extra: '<tie type="start"/>' })}</measure>
        <measure number="2">${note('G', 4, 4, { extra: '<tie type="stop"/>' })}${rest(4)}</measure>`),
      'test',
    );
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0]).toMatchObject({ beat: 3, beats: 3 });
  });

  it('reads key and time signatures, bars and a short pickup bar', () => {
    const s = parser.parse(
      score(`
        <measure number="0" implicit="yes">${attributes(2, 1, 3)}${note('D', 5, 2)}</measure>
        <measure number="1">${note('G', 4, 6)}</measure>
        <measure number="2">${note('A', 4, 6)}</measure>`),
      'test',
    );
    expect(s.notation.keySignatures).toEqual([{ beat: 0, fifths: 1, minor: false }]);
    expect(s.notation.timeSignatures).toEqual([{ beat: 0, numerator: 3, denominator: 4 }]);
    expect(s.barBeats).toEqual([0, 1, 4]); // the pickup lasts one quarter, not three
  });

  it('follows tempo changes', () => {
    const s = parser.parse(
      score(`
        <measure number="1">${attributes()}${tempo(120)}${note('C', 4, 8)}</measure>
        <measure number="2">${tempo(60)}${note('D', 4, 8)}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => [n.start, n.duration])).toEqual([
      [0, 2], // four quarters at 120
      [2, 4], // four quarters at 60
    ]);
  });

  it('takes loudness from dynamics', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}<direction><sound dynamics="40"/></direction>${note('C', 4, 8)}</measure>`),
      'test',
    );
    expect(s.notes[0].velocity).toBeCloseTo((40 * 0.9) / 127);
  });

});
