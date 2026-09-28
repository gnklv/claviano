// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { layoutNotation } from '../src/infrastructure/render/notationLayout';
import { isHeldAt, secondsAtBeat } from '../src/domain/score';

const parser = new MusicXmlParser();
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

/** A two-staff piano score; `measures` is the inner XML of the part. */
const score = (measures: string, extra = '') =>
  bytes(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${extra}
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`);

const attributes = (divisions = 2, fifths = 0, beats = 4) => `
  <attributes>
    <divisions>${divisions}</divisions>
    <key><fifths>${fifths}</fifths></key>
    <time><beats>${beats}</beats><beat-type>4</beat-type></time>
    <staves>2</staves>
  </attributes>`;

const note = (step: string, octave: number, duration: number, { staff = 1, alter = 0, extra = '' } = {}) => `
  <note>
    <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>
    <duration>${duration}</duration><staff>${staff}</staff>${extra}
  </note>`;

const rest = (duration: number) => `<note><rest/><duration>${duration}</duration></note>`;
const tempo = (bpm: number) => `<direction><direction-type><words>T</words></direction-type><sound tempo="${bpm}"/></direction>`;

describe('MusicXmlParser', () => {
  it('recognises uncompressed MusicXML files only', () => {
    expect(parser.canParse('piece.musicxml')).toBe(true);
    expect(parser.canParse('piece.XML')).toBe(true);
    expect(parser.canParse('piece.mxl')).toBe(false);
    expect(parser.canParse('piece.mid')).toBe(false);
  });

  it('reads pitches, beats and seconds', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${tempo(60)}
        ${note('C', 4, 2)}${note('E', 4, 1, { alter: -1 })}${rest(1)}${note('D', 5, 4)}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => [n.pitch, n.beat, n.beats])).toEqual([
      [pitch('Do', 4), 0, 1],
      [pitch('Mib', 4), 1, 0.5],
      [pitch('Re', 5), 2, 2],
    ]);
    // At 60 quarters per minute a beat is a second.
    expect(s.notes[2]).toMatchObject({ start: 2, duration: 2 });
  });

  it('maps beats to seconds through a tempo change inside a bar', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${tempo(60)}${note('C', 4, 4)}${tempo(120)}${note('D', 4, 4)}</measure>`),
      'test',
    );
    expect(secondsAtBeat(s, 1)).toBeCloseTo(1);
    expect(secondsAtBeat(s, 2)).toBeCloseTo(2);
    expect(secondsAtBeat(s, 3)).toBeCloseTo(2.5); // twice as fast from beat 2
  });

  it('marks a fermata in the time map as held', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${tempo(60)}${note('C', 4, 4, { extra: '<type>half</type><notations><fermata/></notations>' })}${note('D', 4, 4)}</measure>`),
      'test',
    );
    expect(isHeldAt(s, 1)).toBe(true);
    expect(isHeldAt(s, 0)).toBe(false); // its start is still counted
    expect(isHeldAt(s, 3)).toBe(false);
    expect(secondsAtBeat(s, 2)).toBeCloseTo(4); // held twice as long
  });

  describe('tempo marks', () => {
    const metronome = (unit: string, dot: boolean, perMinute: string, sound = '') =>
      `<direction><direction-type><metronome><beat-unit>${unit}</beat-unit>${dot ? '<beat-unit-dot/>' : ''}<per-minute>${perMinute}</per-minute></metronome></direction-type>${sound}</direction>`;

    it('reads a printed metronome mark with its unit, and a bare tempo in quarters', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${metronome('quarter', true, '60', '<sound tempo="90"/>')}${note('C', 4, 8)}</measure>
          <measure number="2">${tempo(120)}${note('D', 4, 8)}</measure>`),
        'test',
      );
      expect(s.tempoMarks).toEqual([
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
      expect(s.tempoMarks).toEqual([{ beat: 0, unit: { value: 'half', dots: 0 }, perMinute: 45 }]);
    });
  });

  it('prints notes under an octave shift an octave nearer, sounding as written in the file', () => {
    const shift = (type: string) => `<direction><direction-type><octave-shift type="${type}" size="8"/></direction-type><staff>1</staff></direction>`;
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${shift('down')}${note('C', 7, 4)}${shift('stop')}${note('C', 5, 4)}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => n.pitch)).toEqual([pitch('Do', 7), pitch('Do', 5)]);
    expect(s.written!.map((n) => n.pitch.octave)).toEqual([6, 5]);
    expect(s.octaveShifts).toEqual([{ staff: 1, start: 0, end: 2, octaves: 1 }]);
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
      expect(s.dynamics.map((d) => [d.text, d.beat, d.letters])).toEqual([
        ['p', 0, true],
        ['ff', 2, true],
      ]);
      expect(s.notes[1].velocity).toBeGreaterThan(s.notes[0].velocity);
    });

    it('reads a hairpin from its start to its stop, and "cresc." as words that sound like one', () => {
      const words = '<direction><direction-type><words>cresc.</words></direction-type></direction>';
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${mark('p')}${wedge('crescendo')}${note('C', 4, 2)}${note('D', 4, 2)}${wedge('stop')}${mark('f')}${note('E', 4, 2)}${words}${note('F', 4, 2)}</measure>`),
        'test',
      );
      expect(s.hairpins).toEqual([{ start: 0, end: 2, type: 'crescendo', below: false, drawn: true }]);
      expect(s.dynamics.map((d) => [d.text, d.letters])).toEqual([
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
    expect(s.keySignatures).toEqual([{ beat: 0, fifths: 1, minor: false }]);
    expect(s.timeSignatures).toEqual([{ beat: 0, numerator: 3, denominator: 4 }]);
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

  it('skips grace notes', () => {
    const s = parser.parse(
      score(`<measure number="1">${attributes()}<note><grace/><pitch><step>B</step><octave>4</octave></pitch><staff>1</staff></note>${note('C', 5, 8)}</measure>`),
      'test',
    );
    expect(s.notes.map((n) => n.pitch)).toEqual([pitch('Do', 5)]);
  });

  it('uses the work title when the file has one', () => {
    const s = parser.parse(score(`<measure number="1">${attributes()}${note('C', 4, 8)}</measure>`, '<work><work-title>Minuet</work-title></work>'), 'file-name');
    expect(s.title).toBe('Minuet');
  });

  it('rejects files that are not MusicXML', () => {
    expect(() => parser.parse(bytes('<html><body/></html>'), 'x')).toThrow(expect.objectContaining({ code: 'invalid-file' }));
    expect(() => parser.parse(bytes('not xml at all <'), 'x')).toThrow(expect.objectContaining({ code: 'invalid-file' }));
  });

  it('says timewise scores are not supported yet', () => {
    expect(() => parser.parse(bytes('<score-timewise/>'), 'x')).toThrow(expect.objectContaining({ code: 'unsupported-feature' }));
  });

  describe('the notes as printed', () => {
    const triplet = (step: string, marks: string) =>
      note(step, 5, 1, {
        extra: `<voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><stem>down</stem>${marks}`,
      });
    const printed = parser.parse(
      score(`<measure number="1">${attributes(3)}
        ${triplet('C', '<beam number="1">begin</beam><notations><tuplet type="start" bracket="no"/></notations>')}
        ${triplet('E', '<beam number="1">continue</beam><accidental>natural</accidental>')}
        ${triplet('G', '<beam number="1">end</beam><notations><tuplet type="stop"/></notations>')}
        <note><rest/><duration>9</duration></note></measure>`),
      'test',
    ).written!;

    it('keeps value, tuplet, stem, beams and printed accidentals', () => {
      expect(printed).toHaveLength(3);
      expect(printed[0]).toMatchObject({
        duration: { value: 'eighth', dots: 0 },
        tuplet: { actual: 3, normal: 2 },
        tupletStart: { showNumber: true, bracket: false },
        stem: 'down',
        beams: ['begin'],
        pitch: { letter: 0, octave: 5, alteration: 0 },
      });
      expect(printed[1]).toMatchObject({ accidental: 'natural', beams: ['continue'] });
      expect(printed[2]).toMatchObject({ tupletStop: true, beams: ['end'] });
    });

    it('keeps both halves of a tie as printed notes', () => {
      const tied = parser.parse(
        score(`
          <measure number="1">${attributes()}${rest(6)}${note('G', 4, 2, { extra: '<type>quarter</type><tie type="start"/>' })}</measure>
          <measure number="2">${note('G', 4, 4, { extra: '<type>half</type><tie type="stop"/>' })}${rest(4)}</measure>`),
        'test',
      );
      expect(tied.notes).toHaveLength(1);
      expect(tied.written!.map((n) => n.duration.value)).toEqual(['quarter', 'half']);
    });

    it('reads rests: value, whole-bar rests and placement', () => {
      const s = parser.parse(
        score(`
          <measure number="1">${attributes()}
            <note><rest/><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
            <note><rest><display-step>E</display-step><display-octave>5</display-octave></rest><duration>2</duration><voice>2</voice><type>quarter</type><dot/><staff>1</staff></note>
            ${note('C', 5, 5)}
          </measure>
          <measure number="2"><note><rest measure="yes"/><duration>8</duration><staff>2</staff></note>${note('C', 5, 8)}</measure>`),
        'test',
      );
      expect(s.rests).toEqual([
        expect.objectContaining({ staff: 1, beat: 0, duration: { value: 'eighth', dots: 0 }, measure: false, displayPitch: null }),
        expect.objectContaining({ voice: '2', duration: { value: 'quarter', dots: 1 }, displayPitch: { letter: 2, octave: 5 } }),
        expect.objectContaining({ staff: 2, beat: 4, measure: true, clef: 'bass' }),
      ]);
    });

    it('marks where ties start and stop', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}
          ${note('G', 4, 4, { extra: '<type>half</type><tie type="start"/>' })}${note('G', 4, 4, { extra: '<type>half</type><tie type="stop"/>' })}</measure>`),
        'test',
      );
      expect(s.written!.map((n) => [n.tieStart, n.tieStop])).toEqual([
        [true, false],
        [false, true],
      ]);
    });

    it('reads articulations, fermatas and slurs, and plays staccato short and accents loud', () => {
      const s = parser.parse(
        score(`<measure number="1">${attributes()}${tempo(60)}
          ${note('C', 5, 2, { extra: '<type>quarter</type><notations><slur type="start" number="1" placement="above"/><articulations><staccato/></articulations></notations>' })}
          ${note('D', 5, 2, { extra: '<type>quarter</type><notations><articulations><strong-accent/></articulations></notations>' })}
          ${note('E', 5, 4, { extra: '<type>half</type><notations><slur type="stop" number="1"/><fermata type="inverted"/></notations>' })}</measure>`),
        'test',
      );
      expect(s.written!.map((n) => [n.articulations, n.fermata, n.slurs.map((m) => m.type)])).toEqual([
        [['staccato'], null, ['start']],
        [['marcato'], null, []],
        [[], 'inverted', ['stop']],
      ]);
      expect(s.written![0].slurs[0].placement).toBe('above');
      expect(s.notes[0].duration).toBeCloseTo(0.5); // a staccato quarter at 60 BPM
      expect(s.notes[1].velocity).toBeGreaterThan(s.notes[2].velocity);
    });

    it('follows clef changes on a staff', () => {
      const s = parser.parse(
        score(`
          <measure number="1">${attributes()}${note('C', 3, 8, { staff: 2 })}</measure>
          <measure number="2"><attributes><clef number="2"><sign>G</sign><line>2</line></clef></attributes>${note('E', 5, 8, { staff: 2 })}</measure>`),
        'test',
      );
      expect(s.clefs).toContainEqual({ staff: 2, beat: 4, clef: 'treble' });
      expect(s.written!.map((n) => n.clef)).toEqual(['bass', 'treble']);
    });
  });

  describe('repeats and jumps', () => {
    const bar = (number: number, content: string, barlines = '') => `<measure number="${number}">${barlines}${content}</measure>`;
    const whole = (step: string) => note(step, 4, 8, { extra: '<type>whole</type>' });
    const repeatStart = '<barline location="left"><repeat direction="forward"/></barline>';
    const repeatEnd = '<barline location="right"><repeat direction="backward"/></barline>';
    const endingStart = (n: number) => `<barline location="left"><ending number="${n}" type="start"/></barline>`;
    const endingStop = (n: number, type = 'stop') => `<barline location="right"><ending number="${n}" type="${type}"/></barline>`;
    const words = (text: string, sound: string) => `<direction><direction-type><words>${text}</words></direction-type><sound ${sound}/></direction>`;
    const firstNotes = (s: ReturnType<typeof parser.parse>) => s.notes.map((n) => n.pitch);

    it('plays repeats and voltas in performance order, keeping the page for the staff', () => {
      // ‖: C | D |1. E :‖ |2. F | G
      const s = parser.parse(
        score(`
          ${bar(1, attributes() + tempo(60) + whole('C'), repeatStart)}
          ${bar(2, whole('D'))}
          ${bar(3, whole('E'), endingStart(1) + endingStop(1) + repeatEnd)}
          ${bar(4, whole('F'), endingStart(2) + endingStop(2, 'discontinue'))}
          ${bar(5, whole('G'))}`),
        'test',
      );
      expect(s.barWritten).toEqual([0, 1, 2, 0, 1, 3, 4]);
      expect(firstNotes(s)).toEqual([60, 62, 64, 60, 62, 65, 67].map((p) => p + 0));
      expect(s.writtenBarBeats).toEqual([0, 4, 8, 12, 16]);
      expect(s.written).toHaveLength(5); // printed once each
      expect(s.navigation[0]).toMatchObject({ repeatStart: true });
      expect(s.navigation[2]).toMatchObject({ ending: [1], endingLabel: '1.', endingClosed: true, repeatEnd: { times: 2 } });
      expect(s.navigation[3]).toMatchObject({ ending: [2], endingClosed: false });
    });

    it('closes a volta the file leaves open when the next ‖: comes', () => {
      // ‖: C |1. D :‖ |2. E (never closed) | ‖: F :‖ — seen in real files (Für Elise).
      const s = parser.parse(
        score(`
          ${bar(1, attributes() + whole('C'), repeatStart)}
          ${bar(2, whole('D'), endingStart(1) + endingStop(1) + repeatEnd)}
          ${bar(3, whole('E'), endingStart(2))}
          ${bar(4, whole('F'), repeatStart + repeatEnd)}`),
        'test',
      );
      expect(s.navigation[3].ending).toBeUndefined();
      expect(s.barWritten).toEqual([0, 1, 0, 2, 3, 3]);
    });

    it('follows D.C. al Fine', () => {
      const s = parser.parse(
        score(`
          ${bar(1, attributes() + whole('C'))}
          ${bar(2, words('Fine', 'fine="yes"') + whole('D'))}
          ${bar(3, words('D.C. al Fine', 'dacapo="yes"') + whole('E'))}`),
        'test',
      );
      expect(s.barWritten).toEqual([0, 1, 2, 0, 1]);
      expect(s.navigation[2]).toMatchObject({ jump: 'dacapo', text: 'D.C. al Fine' });
    });

    it('follows D.S. al Coda with signs only printed', () => {
      const segno = '<direction><direction-type><segno/></direction-type><sound segno="segno"/></direction>';
      const toCoda = words('To Coda', 'tocoda="coda"');
      const coda = '<direction><direction-type><coda/></direction-type><sound coda="coda"/></direction>';
      const s = parser.parse(
        score(`
          ${bar(1, attributes() + whole('C'))}
          ${bar(2, segno + whole('D'))}
          ${bar(3, toCoda + whole('E'))}
          ${bar(4, words('D.S. al Coda', 'dalsegno="segno"') + whole('F'))}
          ${bar(5, coda + whole('G'))}`),
        'test',
      );
      expect(s.barWritten).toEqual([0, 1, 2, 3, 1, 2, 4]);
      expect(s.navigation[1]).toMatchObject({ segno: true, segnoSign: true });
      expect(s.navigation[4]).toMatchObject({ coda: true, codaSign: true });
    });

    it('holds a fermata and moves what follows later', () => {
      const s = parser.parse(
        score(`${bar(1, attributes() + tempo(60) + note('C', 4, 2, { extra: '<type>quarter</type><notations><fermata/></notations>' }) + note('D', 4, 2, { extra: '<type>quarter</type>' }) + rest(4))}`),
        'test',
      );
      expect(s.notes[0].duration).toBeCloseTo(2); // a quarter at 60 BPM, held twice as long
      expect(s.notes[1].start).toBeCloseTo(2); // the next note waits for it
    });

    it('keeps a tie across a repeat within one pass', () => {
      const s = parser.parse(
        score(`
          ${bar(1, attributes() + note('C', 4, 8, { extra: '<type>whole</type><tie type="start"/>' }), repeatStart)}
          ${bar(2, note('C', 4, 8, { extra: '<type>whole</type><tie type="stop"/>' }), repeatEnd)}`),
        'test',
      );
      expect(s.notes.map((n) => n.beats)).toEqual([8, 8]); // two passes, each a tied pair
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
      expect(s.pedalMarks).toEqual([
        { pedal: 'sustain', beat: 0, type: 'start', sign: true, line: false },
        { pedal: 'sustain', beat: 2, type: 'change', sign: false, line: true },
        { pedal: 'sustain', beat: 4, type: 'stop', sign: true, line: false },
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
      expect(s.pedalMarks).toEqual([]);
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
      expect(s.pedalMarks.map((m) => [m.pedal, m.type, m.beat])).toEqual([
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
      expect(s.pedalMarks.map((m) => [m.pedal, m.type, m.text])).toEqual([
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
      expect(s.pedalMarks).toHaveLength(2); // printed once
    });
  });
});
