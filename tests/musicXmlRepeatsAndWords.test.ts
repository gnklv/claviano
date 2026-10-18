// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { attributes, note, parser, rest, score, tempo } from './musicXmlScore';

describe('MusicXmlParser', () => {
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
      expect(s.notation.bars.map((bar) => bar.start)).toEqual([0, 4, 8, 12, 16]);
      expect(s.notation.notes).toHaveLength(5); // printed once each
      expect(s.notation.bars[0].navigation).toMatchObject({ repeatStart: true });
      expect(s.notation.bars[2].navigation).toMatchObject({ ending: [1], endingLabel: '1.', endingClosed: true, repeatEnd: { times: 2 } });
      expect(s.notation.bars[3].navigation).toMatchObject({ ending: [2], endingClosed: false });
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
      expect(s.notation.bars[3].navigation.ending).toBeUndefined();
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
      expect(s.notation.bars[2].navigation).toMatchObject({ jump: 'dacapo', text: 'D.C. al Fine' });
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
      expect(s.notation.bars[1].navigation).toMatchObject({ segno: true, segnoSign: true });
      expect(s.notation.bars[4].navigation).toMatchObject({ coda: true, codaSign: true });
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

  it('reads the finger printed at a note, with its side when the file says, and a head in brackets', () => {
    const finger = (text: string, placement = '') => `<notations><technical><fingering ${placement}>${text}</fingering></technical></notations>`;
    const s = parser.parse(
      score(`<measure number="1">${attributes()}
        ${note('C', 4, 2, { extra: finger('1') })}${note('E', 4, 2, { extra: finger('3', 'placement="below"') })}
        ${note('G', 4, 2, { extra: finger('2-1', 'placement="above"') })}${note('C', 5, 2, { extra: '<notehead parentheses="yes">normal</notehead>' })}</measure>`),
      'test',
    );
    expect(s.notation.notes.map((n) => n.fingering ?? null)).toEqual([{ text: '1', below: null }, { text: '3', below: true }, { text: '2-1', below: false }, null]);
    expect(s.notation.notes.map((n) => n.parenthesized ?? false)).toEqual([false, false, false, true]);
    const layout = layoutNotation(s);
    // With no side given, over the upper staff; "below" is under it.
    expect(layout.fingerings.map((f) => [f.text, f.above])).toEqual([
      ['1', true],
      ['3', false],
      ['2-1', true],
    ]);
    expect(layout.chords.map((c) => c.notes[0].parenthesized ?? false)).toEqual([false, false, false, true]);
    expect(s.notes).toHaveLength(4);
  });

  describe('words in the music', () => {
    const said = (text: string, { attrs = '', placement = 'above', sound = '' } = {}) =>
      `<direction placement="${placement}"><direction-type><words ${attrs}>${text}</words></direction-type>${sound}</direction>`;
    const read = (directions: string) =>
      parser.parse(score(`<measure number="1">${attributes()}${directions}${note('C', 4, 4)}${note('E', 4, 4)}</measure>`), 'test').notation.words;

    it('reads a tempo in words: bold, or plain words that set the tempo', () => {
      expect(read(said('Allegro', { attrs: 'font-weight="bold"' }))).toEqual([{ beat: 0, text: 'Allegro', tempo: true, below: false }]);
      expect(read(said('Adagio', { sound: '<sound tempo="60"/>' }))).toEqual([{ beat: 0, text: 'Adagio', tempo: true, below: false }]);
    });

    it('reads other words as they are placed: over the staff or under it', () => {
      expect(read(said('tranquillo', { attrs: 'font-style="italic"' }) + said('sempre legato', { placement: 'below' }))).toEqual([
        { beat: 0, text: 'tranquillo', tempo: false, below: false },
        { beat: 0, text: 'sempre legato', tempo: false, below: true },
      ]);
      // Words printed in another way stay words, even on a direction that sets the tempo.
      expect(read(said('con espressione', { attrs: 'font-weight="normal"', sound: '<sound tempo="60"/>' }))[0].tempo).toBe(false);
    });

    it('leaves out what has a place of its own, and what is not words at all', () => {
      const jump = '<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>';
      expect(read(said('cresc.') + said('una corda') + jump + said('66', { sound: '<sound tempo="66"/>' }) + said('  ') + said('dolce'))).toEqual([
        { beat: 0, text: 'dolce', tempo: false, below: false },
      ]);
      expect(read('<direction><direction-type><words print-object="no">hidden</words></direction-type></direction>')).toEqual([]);
    });

    it('puts words where their direction stands in the bar', () => {
      const words = parser.parse(score(`<measure number="1">${attributes()}${note('C', 4, 4)}${said('rit.')}${note('E', 4, 4)}</measure>`), 'test').notation.words;
      expect(words.map((w) => [w.text, w.beat])).toEqual([['rit.', 2]]);
    });
  });

});
