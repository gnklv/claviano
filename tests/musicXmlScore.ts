import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';

/* MusicXML written in a few words, for the parser's tests: a two-staff piano part, its notes and rests. */

export const parser = new MusicXmlParser();
export const bytes = (text: string) => new TextEncoder().encode(text).buffer;

/** A two-staff piano score; `measures` is the inner XML of the part. */
export const score = (measures: string, extra = '') =>
  bytes(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${extra}
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`);

export const attributes = (divisions = 2, fifths = 0, beats = 4) => `
  <attributes>
    <divisions>${divisions}</divisions>
    <key><fifths>${fifths}</fifths></key>
    <time><beats>${beats}</beats><beat-type>4</beat-type></time>
    <staves>2</staves>
  </attributes>`;

export const note = (step: string, octave: number, duration: number, { staff = 1, alter = 0, extra = '' } = {}) => `
  <note>
    <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>
    <duration>${duration}</duration><staff>${staff}</staff>${extra}
  </note>`;

export const rest = (duration: number) => `<note><rest/><duration>${duration}</duration></note>`;
export const tempo = (bpm: number) => `<direction><direction-type><words>T</words></direction-type><sound tempo="${bpm}"/></direction>`;
