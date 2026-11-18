// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { writtenBarNumber } from '../src/domain/score';
import { writePdfPreviewMusicXml } from '../src/infrastructure/writers/pdfPreviewMusicXml';
import { AUGMENTATION_DOT } from '../src/infrastructure/render/staff/glyphs';
import { drawStaff, texts } from './drawnStaff';
import { attributes, bytes, note, parser, score } from './musicXmlScore';
import { score as showcase } from './showcaseScore';

test('writes jump targets at the start and jumps at the end of their measures', () => {
  const source = parser.parse(score(`<measure number="1">${attributes(4)}
    <direction><direction-type><segno/></direction-type><sound segno="segno"/></direction>
    ${note('C', 4, 16)}
    <direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>
    </measure><measure number="2">
    ${note('E', 4, 16)}
    <backup><duration>16</duration></backup>
    ${note('G', 3, 4, { staff: 2 })}
    <direction><direction-type><words>D.S. al Fine</words></direction-type><sound dalsegno="segno"/></direction>
    </measure>`), 'Navigation');
  const xml = writePdfPreviewMusicXml(source.notation);
  expect(xml).toMatch(/<segno\/>.*?<sound segno="segno"\/>.*?<note>.*?<\/note><direction[^>]*>.*?<words>Fine<\/words>/);
  expect(xml).toMatch(/<\/note><forward><duration>10080<\/duration><\/forward><direction[^>]*>.*?<words>D\.S\. al Fine<\/words>/);
  const reopened = parser.parse(bytes(xml), 'Preview');
  expect(reopened.notation.bars).toEqual(source.notation.bars);
  expect(reopened.barWritten).toEqual([0, 1, 0]);
});

test('exports simultaneous chord notes, a separate resting voice, and a marking inside the bar', () => {
  const xml = score(`<measure number="1">${attributes(6, 0, 2)}
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration>
      <voice>1</voice><type>half</type><staff>1</staff><notations><arpeggiate/></notations></note>
    <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>12</duration>
      <voice>1</voice><type>half</type><staff>1</staff><notations><arpeggiate/></notations></note>
    <backup><duration>12</duration></backup>
    <note><rest/><duration>6</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    <direction placement="above"><direction-type><words>rall.</words></direction-type></direction>
    <note><pitch><step>G</step><octave>3</octave></pitch><duration>6</duration>
      <voice>2</voice><type>quarter</type><staff>1</staff><notations><fermata/></notations></note>
  </measure>`);
  const original = parser.parse(xml, 'Exercise').notation;
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(original)), 'Preview').notation;
  expect(reopened.notes).toEqual(original.notes);
  expect(reopened.rests).toEqual(original.rests);
  expect(reopened.words).toEqual(original.words);
  expect(reopened.bars).toEqual(original.bars);
});

test('preserves and draws both dots of a note and a thirty-second rest', () => {
  const xml = score(`<measure number="1">${attributes(32)}
    <direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><beat-unit-dot/>
      <per-minute>60</per-minute></metronome></direction-type><sound tempo="105"/></direction>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>56</duration>
      <type>quarter</type><dot/><dot/></note>
    <note><rest/><duration>7</duration><type>32nd</type><dot/><dot/></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><type>16th</type></note>
  </measure>`);
  const original = parser.parse(xml, 'Dots');
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(original.notation)), 'Preview');
  for (const piece of [original, reopened]) {
    expect(piece.notation.notes[0]?.duration).toEqual({ value: 'quarter', dots: 2 });
    expect(piece.notation.notes[1]?.beat).toBe(63 / 32);
    expect(piece.notation.rests[0]?.duration).toEqual({ value: 'thirtySecond', dots: 2 });
    expect(piece.notation.tempoMarks[0]?.unit.dots).toBe(2);
    const { shown } = drawStaff(piece);
    const dots = texts(shown).filter((shape) => shape.text === AUGMENTATION_DOT);
    expect(dots).toHaveLength(4);
    for (const first of [0, 2]) {
      expect(dots[first + 1].x).toBeGreaterThan(dots[first].x);
      expect(dots[first + 1].y).toBe(dots[first].y);
    }
  }
});

test('keeps a standalone pickup numbered zero when exported and reopened', () => {
  const contents = attributes(2) + '<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>';
  for (const pickup of [true, false]) {
    const measure = pickup ? '<measure number="0" implicit="yes">' : '<measure number="1">';
    const source = parser.parse(score(measure + contents + '</measure>'), 'Fragment');
    const xml = writePdfPreviewMusicXml(source.notation);
    expect(xml).toContain(measure);
    const reopened = parser.parse(bytes(xml), 'Reopened');
    expect(writtenBarNumber(reopened, 0)).toBe(pickup ? 0 : 1);
    expect(reopened.notation.bars[0]?.length).toBe(1);
  }
});

test('exports key, meter, clef and dotted metronome changes in their measures', () => {
  const original = parser.parse(score(`
    <measure number="1">${attributes(4)}
      <note><rest measure="yes"/><duration>16</duration><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>-3</fifths></key><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/>
        <per-minute>60</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <note><rest measure="yes"/><duration>12</duration><type>whole</type></note>
    </measure>
    <measure number="3">
      <attributes><clef number="2"><sign>G</sign><line>2</line><clef-octave-change>1</clef-octave-change></clef></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>12</duration>
        <type>half</type><dot/><staff>2</staff></note>
    </measure>
  `), 'Changes').notation;

  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(original)), 'Reopened').notation;
  expect(reopened.keySignatures).toEqual(original.keySignatures);
  expect(reopened.timeSignatures).toEqual(original.timeSignatures);
  expect(reopened.clefs).toEqual(original.clefs);
  expect(reopened.tempoMarks).toEqual(original.tempoMarks);
  expect(reopened.tempos).toEqual(original.tempos);
  expect(reopened.bars).toEqual(original.bars);
  expect(reopened.notes).toEqual(original.notes);
});

test('reopens one octave bracket over simultaneous voices at the correct onsets', () => {
  const quarter = (step: string, voice: number) => note(step, 4, 2, { extra: `<voice>${voice}</voice><type>quarter</type>` });
  const piece = parser.parse(score(`<measure number="1">${attributes(2, 0, 2)}
    ${quarter('C', 1)}${quarter('D', 1)}<backup><duration>4</duration></backup>
    ${quarter('E', 2)}${quarter('F', 2)}</measure>`), 'Two voices').notation;
  const shifted = { ...piece, octaveShifts: [{ start: 1, end: 2, staff: 1, octaves: 1 }],
    notes: piece.notes.map(n => n.beat === 1 ? { ...n, sounding: n.sounding + 12 } : n) };
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(shifted)), 'Reopened').notation;
  expect(reopened.octaveShifts).toEqual(shifted.octaveShifts);
  expect(reopened.notes).toHaveLength(shifted.notes.length);
  for (const n of shifted.notes) expect(reopened.notes).toContainEqual(n);
});

test('keeps a pedal change and overlapping sustain and sostenuto releases distinct', () => {
  const pedal = (type: string, number: number) =>
    `<direction><direction-type><pedal type="${type}" number="${number}" line="yes"/></direction-type></direction>`;
  const source = parser.parse(score(`<measure number="1">${attributes()}
    ${pedal('start', 1)}${note('C', 3, 2)}
    ${pedal('change', 1)}${pedal('sostenuto', 2)}${note('E', 3, 2)}
    ${pedal('stop', 1)}${note('G', 3, 4)}${pedal('stop', 2)}</measure>`), 'Two pedals').notation;
  const xml = writePdfPreviewMusicXml(source);
  const reopened = parser.parse(bytes(xml), 'Reopened').notation;
  expect(reopened.pedalMarks).toEqual(source.pedalMarks);
  expect(reopened.pedalMoves).toEqual(source.pedalMoves);
  expect(xml.match(/<pedal type="change"/g)).toHaveLength(1);
});

test('reopens grace notes on their principal notes with a slash, slur, accidental and beams', () => {
  const source = parser.parse(score(`<measure number="1">${attributes(2, 0, 2)}
    <note><grace slash="yes"/><pitch><step>D</step><octave>4</octave></pitch>
      <voice>1</voice><type>eighth</type><staff>1</staff></note>
    ${note('E', 4, 2, { extra: '<voice>1</voice><type>quarter</type>' })}
    <note><grace/><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
      <voice>1</voice><type>16th</type><accidental>sharp</accidental><staff>1</staff>
      <beam number="1">begin</beam><beam number="2">begin</beam><notations><slur type="start" number="2"/></notations></note>
    <note><grace/><pitch><step>G</step><octave>4</octave></pitch>
      <voice>1</voice><type>16th</type><staff>1</staff><beam number="1">end</beam><beam number="2">end</beam></note>
    ${note('A', 4, 2, { extra: '<voice>1</voice><type>quarter</type><notations><slur type="stop" number="2"/></notations>' })}
    <backup><duration>4</duration></backup>
    <note><grace slash="yes"/><pitch><step>G</step><octave>2</octave></pitch>
      <voice>5</voice><type>eighth</type><staff>2</staff></note>
    ${note('A', 2, 4, { staff: 2, extra: '<voice>5</voice><type>half</type>' })}</measure>`), 'Grace notes').notation;
  const xml = writePdfPreviewMusicXml(source);
  const reopened = parser.parse(bytes(xml), 'Reopened').notation;
  expect(reopened.graces).toEqual(source.graces);
  expect(reopened.notes).toEqual(source.notes);
  expect(reopened.bars).toEqual(source.bars);
  expect(xml).toContain('<beam number="1">begin</beam><beam number="2">begin</beam>');
  expect(xml).toContain('<beam number="1">end</beam><beam number="2">end</beam>');
  expect(xml).toContain('<slur type="start" number="2"/>');
});

test('reopens the printed ornaments, tremolos and arpeggio of showcase bars 21 and 22 with their playback', () => {
  const xml = writePdfPreviewMusicXml(showcase.notation);
  const reopened = parser.parse(bytes(xml), 'Reopened');
  const written = (piece: typeof showcase) => piece.notation.notes
    .filter(n => [21, 22].includes(writtenBarNumber(piece, n.bar)))
    .map(({ beat, beats, staff, sounding, duration, tuplet, ornaments, trillLine, tremolo, arpeggio }) =>
      ({ beat, beats, staff, sounding, duration, tuplet, ornaments, trillLine, tremolo, arpeggio }));
  const played = (piece: typeof showcase) => piece.notes
    .filter(n => n.beat >= piece.barBeats[21] && n.beat < piece.barBeats[23])
    .map(({ pitch, hand, beat, beats }) => ({ pitch, hand, beat, beats }));
  expect(written(reopened)).toEqual(written(showcase));
  expect(played(reopened)).toEqual(played(showcase));
});

test('reopens below-staff ornament placement and both neighbor accidentals', () => {
  const source = parser.parse(score(`<measure number="1">${attributes()}
    ${note('E', 4, 8, { extra: '<notations><ornaments><inverted-turn placement="below"/>'
      + '<accidental-mark placement="above">flat-flat</accidental-mark>'
      + '<accidental-mark placement="below">double-sharp</accidental-mark></ornaments></notations>' })}
    </measure>`), 'Accidentals');
  const reopened = parser.parse(bytes(writePdfPreviewMusicXml(source.notation)), 'Reopened');
  expect(reopened.notation.notes[0].ornaments).toEqual([
    { kind: 'inverted-turn', accidentalAbove: 'double-flat', accidentalBelow: 'double-sharp', below: true },
  ]);
});
