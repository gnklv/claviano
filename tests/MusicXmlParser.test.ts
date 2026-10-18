// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { engrave as layoutNotation } from '../src/domain/notation/engraving';
import { isHeldAt, secondsAtBeat } from '../src/domain/score';
import { zip } from './zipWriter';
import { attributes, bytes, note, parser, rest, score, tempo } from './musicXmlScore';

/* Reading MusicXML: the files, the notes and their time. The rest of what a score says is in the musicXml*.test.ts files. */

describe('MusicXmlParser', () => {
  it('recognises MusicXML files, plain and compressed', () => {
    expect(parser.canParse('piece.musicxml')).toBe(true);
    expect(parser.canParse('piece.XML')).toBe(true);
    expect(parser.canParse('piece.mxl')).toBe(true);
    expect(parser.canParse('piece.mid')).toBe(false);
  });

  describe('compressed files (.mxl)', () => {
    const plain = score(`<measure number="1">${attributes()}${note('C', 4, 4)}${note('E', 4, 4)}</measure>`);
    const container = (path: string) =>
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="${path}"/></rootfiles></container>`;

    it('reads the score the archive\'s container names', () => {
      const archive = zip([
        { name: 'META-INF/container.xml', data: container('scores/piece.xml') },
        { name: 'notes.xml', data: '<not-a-score/>' },
        { name: 'scores/piece.xml', data: new Uint8Array(plain) },
      ]);
      const s = parser.parse(archive, 'test');
      expect(s.notes.map((n) => n.pitch)).toEqual([pitch('Do', 4), pitch('Mi', 4)]);
    });

    it('reads a score stored without compression, and one with no container', () => {
      const archive = zip([{ name: 'piece.musicxml', data: new Uint8Array(plain), stored: true }]);
      expect(parser.parse(archive, 'test').notes).toHaveLength(2);
    });

    it('rejects an archive without a score, or a broken one', () => {
      expect(() => parser.parse(zip([{ name: 'readme.txt', data: 'hello' }]), 'test')).toThrow(/no score/);
      const broken = new Uint8Array(zip([{ name: 'piece.xml', data: new Uint8Array(plain) }]));
      broken.fill(0xff, 40, 80); // garbage in the compressed data
      expect(() => parser.parse(broken.buffer, 'test')).toThrow();
    });
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

  it('moves a tempo change by its offset', () => {
    // Written before the half note, but meant from its second beat (offset of one quarter).
    const later = `<direction><direction-type><words>T</words></direction-type><offset>2</offset><sound tempo="120"/></direction>`;
    const s = parser.parse(
      score(`<measure number="1">${attributes()}${tempo(60)}${note('C', 4, 4)}${later}${note('D', 4, 4)}</measure>`),
      'test',
    );
    expect(secondsAtBeat(s, 2)).toBeCloseTo(2);
    expect(secondsAtBeat(s, 3)).toBeCloseTo(3); // still slow up to beat 3
    expect(secondsAtBeat(s, 4)).toBeCloseTo(3.5);
    expect(s.notation.tempoMarks.map((m) => [m.beat, m.perMinute])).toEqual([
      [0, 60],
      [3, 120],
    ]);
  });

  it('joins a piano written as two one-staff parts', () => {
    // The right hand counts in halves of a quarter, the left in quarters of one.
    const file = bytes(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano RH</part-name></score-part>
    <score-part id="P2"><part-name>Piano LH</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      ${tempo(60)}
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/></note>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`);
    const s = parser.parse(file, 'test');
    const played = (hand: string) => s.notes.filter((n) => n.hand === hand).map((n) => [n.pitch, n.beat, n.beats]);
    expect(played('right')).toEqual([
      [pitch('Mi', 5), 0, 1],
      [pitch('Re', 5), 1, 1],
      [pitch('Do', 5), 2, 2],
    ]);
    expect(played('left')).toEqual([
      [pitch('Do', 3), 0, 2],
      [pitch('Sol', 2), 2, 1.5],
      [pitch('Si', 2), 3.5, 0.5],
    ]);
    expect(s.bars).toHaveLength(2);
    // Drawn on the lower staff, in the bass clef.
    const lower = layoutNotation(s).chords.filter((c) => c.staff === 'bass');
    expect(lower.map((c) => c.beat)).toEqual([0, 2, 3.5]);
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
});
