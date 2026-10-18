// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attributes, bytes, note, parser, rest, score, tempo } from './musicXmlScore';

describe('MusicXmlParser', () => {
  describe('the title', () => {
    const titled = (extra: string) => parser.parse(score(`<measure number="1">${attributes()}${note('C', 4, 8)}</measure>`, extra), 'file-name').title;
    const credit = (type: string, words: string) => `<credit page="1"><credit-type>${type}</credit-type><credit-words>${words}</credit-words></credit>`;

    it('is the movement’s when the work has none', () => {
      expect(titled('<movement-title>Allegro</movement-title>')).toBe('Allegro');
    });

    it('is the one printed on the first page when the file names neither', () => {
      expect(titled(credit('composer', 'J. S. Bach') + credit('title', 'Prelude I'))).toBe('Prelude I');
      expect(titled(credit('title', 'Sonate No. 14,') + credit('subtitle', 'Moonlight'))).toBe('Sonate No. 14');
    });

    it('is not an editor’s placeholder: the printed title, or the file’s name, instead', () => {
      const placeholder = '<work><work-title>Partitura senza titolo</work-title></work>';
      expect(titled(placeholder + credit('title', 'La Valse d’Amélie'))).toBe('La Valse d’Amélie');
      expect(titled(placeholder)).toBe('file-name');
      for (const name of ['Untitled score', 'Untitled Score', 'Title', 'Partition sans titre', 'Partitura sin título', 'Unbenannte Partitur', 'Партитура без названия']) {
        expect(titled(`<work><work-title>${name}</work-title></work>`), name).toBe('file-name');
      }
    });

    it('keeps a real title that only looks like one of those words', () => {
      expect(titled('<work><work-title>Title Track</work-title></work>')).toBe('Title Track');
      expect(titled('<work><work-title>Film Score Suite</work-title></work>')).toBe('Film Score Suite');
    });

    it('is the file’s name when the file has nothing better', () => {
      expect(titled('')).toBe('file-name');
      expect(titled('<work><work-title>  </work-title></work>')).toBe('file-name');
    });
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
    ).notation.notes;

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
      expect(tied.notation.notes.map((n) => n.duration.value)).toEqual(['quarter', 'half']);
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
      expect(s.notation.rests).toEqual([
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
      expect(s.notation.notes.map((n) => [n.tieStart, n.tieStop])).toEqual([
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
      expect(s.notation.notes.map((n) => [n.articulations, n.fermata, n.slurs.map((m) => m.type)])).toEqual([
        [['staccato'], null, ['start']],
        [['marcato'], null, []],
        [[], 'inverted', ['stop']],
      ]);
      expect(s.notation.notes[0].slurs[0].placement).toBe('above');
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
      expect(s.notation.clefs).toContainEqual({ staff: 2, beat: 4, clef: 'treble' });
      expect(s.notation.notes.map((n) => n.clef)).toEqual(['bass', 'treble']);
    });
  });

});
