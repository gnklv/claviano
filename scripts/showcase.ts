/**
 * Builds public/demos/showcase.musicxml: a short score that shows everything the player can draw
 * and play, bar by bar. Not music, a test card. Run: npm run showcase
 *
 * Durations are in divisions of 120 per quarter note: divisible by 8 (thirty-seconds),
 * 3 (triplets) and 5 (quintuplets), so every value is a whole number.
 */
import { writeFileSync } from 'node:fs';

const Q = 120;
const H = 2 * Q;
const W = 4 * Q;
const E = Q / 2;
const S = Q / 4;
const T = Q / 8;
const dotted = (value: number) => value * 1.5;

type Tie = 'start' | 'stop' | 'both';

interface NoteOptions {
  staff?: 1 | 2;
  voice?: number;
  type: string;
  dots?: number;
  stem?: 'up' | 'down';
  beams?: string[];
  accidental?: string;
  tie?: Tie;
  chord?: boolean;
  tuplet?: { actual: number; normal: number; start?: boolean; stop?: boolean; bracket?: 'yes' | 'no'; hideNumber?: boolean };
  /** MusicXML articulation names: staccato, staccatissimo, tenuto, detached-legato, accent, strong-accent. */
  articulations?: string[];
  fermata?: 'upright' | 'inverted';
  slur?: { type: 'start' | 'stop'; number?: number; placement?: 'above' | 'below' }[];
  /** A grace note: small, with no time of its own (pass 0 as its duration); `slash` for an acciaccatura. */
  grace?: { slash: boolean };
}

const defaultVoice = (staff: 1 | 2) => (staff === 1 ? 1 : 5); // MuseScore numbers voices per staff: 1–4 and 5–8

/** A note like "F#4", "Bbb5", "C##5", "A0". */
function note(name: string, duration: number, options: NoteOptions): string {
  const match = /^([A-G])(#{1,2}|b{1,2})?(\d)$/.exec(name);
  if (!match) throw new Error(`Bad note name ${name}`);
  const [, step, accidentals = '', octave] = match;
  const alter = accidentals.startsWith('#') ? accidentals.length : -accidentals.length;
  const staff = options.staff ?? 1;
  const ties = options.tie === 'both' ? ['stop', 'start'] : options.tie ? [options.tie] : [];
  const tuplet = options.tuplet;
  const notations = [
    ...ties.map((type) => `<tied type="${type}"/>`),
    tuplet?.start
      ? `<tuplet type="start"${tuplet.bracket ? ` bracket="${tuplet.bracket}"` : ''}${tuplet.hideNumber ? ' show-number="none"' : ''}/>`
      : '',
    tuplet?.stop ? '<tuplet type="stop"/>' : '',
    ...(options.slur ?? []).map(
      (m) => `<slur type="${m.type}" number="${m.number ?? 1}"${m.placement ? ` placement="${m.placement}"` : ''}/>`,
    ),
    options.articulations?.length ? `<articulations>${options.articulations.map((a) => `<${a}/>`).join('')}</articulations>` : '',
    options.fermata ? `<fermata type="${options.fermata}"/>` : '',
  ].join('');
  return [
    '<note>',
    options.grace ? `<grace${options.grace.slash ? ' slash="yes"' : ''}/>` : '',
    options.chord ? '<chord/>' : '',
    `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`,
    options.grace ? '' : `<duration>${duration}</duration>`,
    ...ties.map((type) => `<tie type="${type}"/>`),
    `<voice>${options.voice ?? defaultVoice(staff)}</voice>`,
    `<type>${options.type}</type>`,
    '<dot/>'.repeat(options.dots ?? 0),
    options.accidental ? `<accidental>${options.accidental}</accidental>` : '',
    tuplet ? `<time-modification><actual-notes>${tuplet.actual}</actual-notes><normal-notes>${tuplet.normal}</normal-notes></time-modification>` : '',
    options.stem ? `<stem>${options.stem}</stem>` : '',
    `<staff>${staff}</staff>`,
    ...(options.beams ?? []).map((mark, i) => `<beam number="${i + 1}">${mark}</beam>`),
    notations ? `<notations>${notations}</notations>` : '',
    '</note>',
  ].join('');
}

/** Several notes sharing one stem: the first carries the options, the rest are marked as chord. */
const chord = (names: string[], duration: number, options: NoteOptions & { ties?: (Tie | undefined)[] }) =>
  names.map((name, i) => note(name, duration, { ...options, tie: options.ties?.[i] ?? options.tie, chord: i > 0 })).join('');

function rest(duration: number, options: { type?: string; dots?: number; staff?: 1 | 2; voice?: number; measure?: boolean }): string {
  const staff = options.staff ?? 1;
  return [
    '<note>',
    options.measure ? '<rest measure="yes"/>' : '<rest/>',
    `<duration>${duration}</duration>`,
    `<voice>${options.voice ?? defaultVoice(staff)}</voice>`,
    options.type ? `<type>${options.type}</type>` : '',
    '<dot/>'.repeat(options.dots ?? 0),
    `<staff>${staff}</staff>`,
    '</note>',
  ].join('');
}

const backup = (duration: number) => `<backup><duration>${duration}</duration></backup>`;
const repeatStart = '<barline location="left"><repeat direction="forward"/></barline>';
const repeatEnd = '<barline location="right"><repeat direction="backward"/></barline>';
const endingStart = (n: number) => `<barline location="left"><ending number="${n}" type="start">${n}.</ending></barline>`;
const endingStop = (n: number, type: 'stop' | 'discontinue') => `<barline location="right"><ending number="${n}" type="${type}"/></barline>`;
/** A sign (segno, coda) printed over the bar, with the <sound> that makes it a jump target. */
const sign = (name: 'segno' | 'coda') => `<direction placement="above"><direction-type><${name}/></direction-type><sound ${name}="${name}"/></direction>`;
const direction = (words: string, sound: string) =>
  `<direction placement="above"><direction-type><words>${words}</words></direction-type><sound ${sound}/></direction>`;
/**
 * A sustain pedal mark under the lower staff: "Ped." / "✱" signs, a bracket line, or "Ped." and a line.
 * Placed where the pedal moves, in the left hand's stream.
 */
const pedal = (type: 'start' | 'change' | 'stop', style: 'sign' | 'line' | 'both' = 'sign') =>
  `<direction placement="below"><direction-type><pedal type="${type}" line="${style === 'sign' ? 'no' : 'yes'}" sign="${style === 'line' ? 'no' : 'yes'}"/></direction-type><staff>2</staff></direction>`;
/** The middle (sostenuto) pedal: "Sost." and a line. It ends with a plain pedal stop, as MusicXML has it. */
const sostenuto = (type: 'start' | 'stop') =>
  `<direction placement="below"><direction-type><pedal type="${type === 'start' ? 'sostenuto' : 'stop'}" line="yes"/></direction-type><staff>2</staff></direction>`;
/** The left (soft) pedal, in words: "una corda" presses it, "tre corde" lifts it. */
const softPedal = (down: boolean) =>
  `<direction placement="below"><direction-type><words font-style="italic">${down ? 'una corda' : 'tre corde'}</words></direction-type><sound soft-pedal="${down ? 'yes' : 'no'}"/></direction>`;
/** A printed metronome mark, e.g. a dotted quarter = 60, with the tempo it sounds at in quarters. */
const metronome = (unit: string, dotted: boolean, perMinute: number, quarters: number) =>
  `<direction placement="above"><direction-type><metronome><beat-unit>${unit}</beat-unit>${dotted ? '<beat-unit-dot/>' : ''}<per-minute>${perMinute}</per-minute></metronome></direction-type><sound tempo="${quarters}"/></direction>`;
/**
 * An octave shift over (or under) the notes of a staff: "down" is 8va (printed an octave lower than
 * played), "up" is 8vb. The notes themselves are written at their sounding pitch, as MusicXML has it.
 */
const octaveShift = (type: 'down' | 'up' | 'stop', staff: 1 | 2) =>
  `<direction placement="${staff === 1 ? 'above' : 'below'}"><direction-type><octave-shift type="${type}" size="8"/></direction-type><staff>${staff}</staff></direction>`;
/** A printed dynamic mark between the staves, with the loudness it sets (MuseScore's levels). */
const DYNAMIC_LEVELS: Record<string, number> = { pp: 36.67, p: 54.44, mp: 71.11, mf: 88.89, f: 106.67, ff: 124.44 };
const dynamic = (mark: string) =>
  `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type><staff>1</staff><sound dynamics="${DYNAMIC_LEVELS[mark]}"/></direction>`;
/** A hairpin between the staves: start it before the notes it covers, stop it after them. */
const wedge = (type: 'crescendo' | 'diminuendo' | 'stop') =>
  `<direction placement="below"><direction-type><wedge type="${type}"/></direction-type><staff>1</staff></direction>`;
const attributes = (inner: string) => `<attributes>${inner}</attributes>`;
const key = (fifths: number) => `<key><fifths>${fifths}</fifths></key>`;
const time = (beats: number, beatType: number) => `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`;
const clef = (staff: 1 | 2, sign: 'G' | 'F') => `<clef number="${staff}"><sign>${sign}</sign><line>${sign === 'G' ? 2 : 4}</line></clef>`;

/** Beam marks for a run of notes on one level: begin, continue…, end. */
const run = (count: number) => Array.from({ length: count }, (_, i) => (i === 0 ? 'begin' : i === count - 1 ? 'end' : 'continue'));
const triplet = (i: number, extra: Partial<NoteOptions['tuplet']> = {}) => ({
  actual: 3,
  normal: 2,
  start: i === 0,
  stop: i === 2,
  ...extra,
});

const measures: string[] = [
  // Pickup: a short first bar, numbered 0.
  `<measure number="0" implicit="yes">
    ${attributes(`<divisions>${Q}</divisions>${key(0)}${time(4, 4)}<staves>2</staves>${clef(1, 'G')}${clef(2, 'F')}`)}
    ${direction('Pickup', 'tempo="90" dynamics="70"')}
    ${note('G4', E, { type: 'eighth', beams: ['begin'] })}${note('A4', E, { type: 'eighth', beams: ['end'] })}
    ${backup(Q)}${rest(Q, { type: 'quarter', staff: 2 })}
  </measure>`,

  // 1–2: every value from whole to thirty-second, dots, ledger lines above and below.
  `<measure number="1">
    ${direction('Values', '')}
    ${note('C6', H, { type: 'half' })}${note('A5', dotted(Q), { type: 'quarter', dots: 1 })}${note('B5', E, { type: 'eighth' })}
    ${backup(W)}${note('C2', W, { type: 'whole', staff: 2 })}
  </measure>`,
  `<measure number="2">
    ${['E5', 'F5', 'G5', 'A5'].map((n, i) => note(n, S, { type: '16th', beams: [run(4)[i], run(4)[i]] })).join('')}
    ${note('B5', dotted(E), { type: 'eighth', dots: 1, beams: ['begin'] })}${note('C6', S, { type: '16th', beams: ['end', 'backward hook'] })}
    ${['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'].map((n, i) => note(n, T, { type: '32nd', beams: [run(8)[i], run(8)[i], run(8)[i]] })).join('')}
    ${note('C4', Q, { type: 'quarter' })}
    ${backup(W)}${note('G2', dotted(H), { type: 'half', dots: 1, staff: 2 })}${rest(Q, { type: 'quarter', staff: 2 })}
  </measure>`,

  // 3: beams mixing values, with partial beams and hooks; a crescendo hairpin (a step louder).
  `<measure number="3">
    ${direction('Beams', '')}
    ${wedge('crescendo')}
    ${note('C5', E, { type: 'eighth', beams: ['begin'] })}${note('D5', S, { type: '16th', beams: ['continue', 'begin'] })}${note('E5', S, { type: '16th', beams: ['end', 'end'] })}
    ${note('F5', S, { type: '16th', beams: ['begin', 'forward hook'] })}${note('G5', dotted(E), { type: 'eighth', dots: 1, beams: ['end'] })}
    ${note('A5', E, { type: 'eighth', beams: ['begin'] })}${note('B5', E, { type: 'eighth', beams: ['end'] })}
    ${note('C6', T, { type: '32nd', beams: ['begin', 'begin', 'begin'] })}${note('B5', T, { type: '32nd', beams: ['continue', 'continue', 'end'] })}
    ${note('A5', S, { type: '16th', beams: ['continue', 'end'] })}${note('G5', E, { type: 'eighth', beams: ['end'] })}
    ${wedge('stop')}
    ${backup(W)}${['C3', 'E3', 'G3', 'C4'].map((n) => note(n, Q, { type: 'quarter', staff: 2 })).join('')}
  </measure>`,

  // 4: accidentals: sharp, one lasting the bar, natural, flat, double sharp, double flat, courtesy natural.
  `<measure number="4">
    ${direction('Accidentals', '')}
    ${note('F#4', E, { type: 'eighth', accidental: 'sharp', beams: ['begin'] })}${note('F#4', E, { type: 'eighth', beams: ['end'] })}
    ${note('F4', E, { type: 'eighth', accidental: 'natural', beams: ['begin'] })}${note('Bb4', E, { type: 'eighth', accidental: 'flat', beams: ['end'] })}
    ${note('B4', E, { type: 'eighth', accidental: 'natural', beams: ['begin'] })}${note('C##5', E, { type: 'eighth', accidental: 'double-sharp', beams: ['end'] })}
    ${note('Ebb5', E, { type: 'eighth', accidental: 'flat-flat', beams: ['begin'] })}${note('C5', E, { type: 'eighth', accidental: 'natural', beams: ['end'] })}
    ${backup(W)}${chord(['C3', 'E3', 'G3'], W, { type: 'whole', staff: 2 })}
  </measure>`,

  // 5: tuplets: beamed triplets (number, no bracket), hidden number, a quintuplet, quarter triplets with a bracket;
  // a diminuendo hairpin (a step softer again).
  `<measure number="5">
    ${direction('Tuplets', '')}
    ${wedge('diminuendo')}
    ${['C5', 'D5', 'E5'].map((n, i) => note(n, Q / 3, { type: 'eighth', stem: 'up', beams: [run(3)[i]], tuplet: triplet(i, { bracket: 'no' }) })).join('')}
    ${['F5', 'E5', 'D5'].map((n, i) => note(n, Q / 3, { type: 'eighth', stem: 'up', beams: [run(3)[i]], tuplet: triplet(i, { bracket: 'no', hideNumber: true }) })).join('')}
    ${['C5', 'D5', 'E5', 'F5', 'G5'].map((n, i) => note(n, Q / 5, { type: '16th', stem: 'up', beams: [run(5)[i], run(5)[i]], tuplet: { actual: 5, normal: 4, start: i === 0, stop: i === 4, bracket: 'no' } })).join('')}
    ${note('G4', Q, { type: 'quarter' })}
    ${wedge('stop')}
    ${backup(W)}
    ${['C3', 'E3', 'G3'].map((n, i) => note(n, H / 3, { type: 'quarter', staff: 2, tuplet: triplet(i, { bracket: 'yes' }) })).join('')}
    ${note('C3', H, { type: 'half', staff: 2 })}
  </measure>`,

  // 6: chords and two voices on one staff (stems up and down), a rest moved aside, a whole-bar rest;
  // where the voices meet a second apart (Re5 over Do5), the up-stem voice moves right.
  `<measure number="6">
    ${direction('Voices', '')}
    ${chord(['E5', 'G5', 'C6'], H, { type: 'half', stem: 'up' })}${chord(['D5', 'F5', 'B5'], H, { type: 'half', stem: 'up' })}
    ${backup(W)}
    ${note('G4', Q, { type: 'quarter', voice: 2, stem: 'down' })}${rest(Q, { type: 'quarter', voice: 2 })}${note('C5', H, { type: 'half', voice: 2, stem: 'down' })}
    ${backup(W)}${rest(W, { staff: 2, measure: true })}
  </measure>`,

  // 7: rests of every value, with a dot.
  `<measure number="7">
    ${direction('Rests', '')}
    ${rest(Q, { type: 'quarter' })}${rest(E, { type: 'eighth' })}${rest(S, { type: '16th' })}${rest(T, { type: '32nd' })}
    ${note('D5', T, { type: '32nd' })}${note('E5', S, { type: '16th' })}${rest(dotted(Q), { type: 'quarter', dots: 1 })}${note('F5', S, { type: '16th' })}
    ${backup(W)}${rest(H, { type: 'half', staff: 2 })}${note('C3', H, { type: 'half', staff: 2 })}
  </measure>`,

  // 8–9: ties, across a bar line and in a chord (upper tie above, lower below).
  `<measure number="8">
    ${direction('Ties', '')}
    ${note('G4', H, { type: 'half', tie: 'start' })}${note('G4', H, { type: 'half', tie: 'both' })}
    ${backup(W)}${chord(['C3', 'G3'], W, { type: 'whole', staff: 2, tie: 'start' })}
  </measure>`,
  `<measure number="9">
    ${note('G4', Q, { type: 'quarter', tie: 'stop' })}${note('A4', Q, { type: 'quarter' })}${note('B4', H, { type: 'half' })}
    ${backup(W)}${chord(['C3', 'G3'], W, { type: 'whole', staff: 2, tie: 'stop' })}
  </measure>`,

  // 10: a new key (three flats) and a new metre (6/8), beamed by three eighths; the tempo is
  // printed in dotted quarters (the same speed: 60 dotted quarters are 90 quarters a minute).
  `<measure number="10">
    ${attributes(`${key(-3)}${time(6, 8)}`)}
    ${direction('Key and time', '')}
    ${metronome('quarter', true, 60, 90)}
    ${['Bb4', 'C5', 'D5'].map((n, i) => note(n, E, { type: 'eighth', beams: [run(3)[i]] })).join('')}
    ${['Eb5', 'F5', 'G5'].map((n, i) => note(n, E, { type: 'eighth', beams: [run(3)[i]] })).join('')}
    ${backup(dotted(H))}${note('Eb3', dotted(H), { type: 'half', dots: 1, staff: 2 })}
  </measure>`,

  // 11: the lower staff switches to treble clef for a high left hand.
  `<measure number="11">
    ${attributes(clef(2, 'G'))}
    ${direction('Clef change', '')}
    ${note('Eb6', dotted(Q), { type: 'quarter', dots: 1 })}${note('G5', dotted(Q), { type: 'quarter', dots: 1 })}
    ${backup(dotted(H))}
    ${['G4', 'Ab4', 'Bb4'].map((n, i) => note(n, E, { type: 'eighth', staff: 2, beams: [run(3)[i]] })).join('')}
    ${['C5', 'D5', 'Eb5'].map((n, i) => note(n, E, { type: 'eighth', staff: 2, beams: [run(3)[i]] })).join('')}
  </measure>`,

  // 12: back to bass clef; slower and quiet, with the left pedal (una corda): quieter and duller.
  `<measure number="12">
    ${attributes(clef(2, 'F'))}
    ${direction('Slower, piano', 'tempo="60"')}
    ${dynamic('p')}
    ${softPedal(true)}
    ${note('Bb4', dotted(H), { type: 'half', dots: 1 })}
    ${backup(dotted(H))}${note('Eb2', dotted(H), { type: 'half', dots: 1, staff: 2 })}
  </measure>`,

  // 13: two sharps, 4/4 again, faster and loud (tre corde: the left pedal comes up); very high and
  // very low notes (keyboard scrolling on phones), printed under 8va and 8vb; the pedal marks go
  // under the 8vb bracket.
  `<measure number="13">
    ${attributes(`${key(2)}${time(4, 4)}`)}
    ${direction('Range, forte', 'tempo="90"')}
    ${dynamic('f')}
    ${softPedal(false)}
    ${octaveShift('down', 1)}${note('D6', Q, { type: 'quarter' })}${note('F#6', Q, { type: 'quarter' })}${note('A6', H, { type: 'half' })}${octaveShift('stop', 1)}
    ${backup(W)}${pedal('start')}${note('D2', H, { type: 'half', staff: 2 })}${octaveShift('up', 2)}${note('A0', H, { type: 'half', staff: 2 })}${octaveShift('stop', 2)}${pedal('stop')}
  </measure>`,

  // 14: articulations. Stems down in the right hand, so its marks go above; stems up in the left
  // hand, so its marks go below. Staccato + accent stack; accents sound louder, staccato shorter.
  `<measure number="14">
    ${direction('Articulation', '')}
    ${note('B5', Q, { type: 'quarter', articulations: ['staccato'] })}${note('A5', Q, { type: 'quarter', articulations: ['tenuto'] })}
    ${note('G5', Q, { type: 'quarter', articulations: ['accent'] })}${note('F#5', Q, { type: 'quarter', articulations: ['strong-accent'] })}
    ${backup(W)}
    ${note('A2', Q, { type: 'quarter', staff: 2, articulations: ['staccatissimo'] })}${note('B2', Q, { type: 'quarter', staff: 2, articulations: ['detached-legato'] })}
    ${note('C#3', Q, { type: 'quarter', staff: 2, articulations: ['staccato', 'accent'] })}${note('G2', Q, { type: 'quarter', staff: 2, articulations: ['staccato'] })}
  </measure>`,

  // 15: legato. A slur over a leaping melody (it must clear the high notes), a fermata that is held
  // (it sounds twice as long); in the bass a slur under the notes, carried across the bar line.
  `<measure number="15">
    ${direction('Legato, fermata', '')}
    ${note('D5', E, { type: 'eighth', beams: ['begin'], slur: [{ type: 'start' }] })}${note('A5', E, { type: 'eighth', beams: ['end'] })}
    ${note('F#5', E, { type: 'eighth', beams: ['begin'] })}${note('D6', E, { type: 'eighth', beams: ['end'], slur: [{ type: 'stop' }] })}
    ${note('B5', H, { type: 'half', fermata: 'upright' })}
    ${backup(W)}
    ${note('G2', Q, { type: 'quarter', staff: 2, slur: [{ type: 'start', number: 2 }] })}${note('A2', Q, { type: 'quarter', staff: 2 })}
    ${note('B2', Q, { type: 'quarter', staff: 2 })}${note('C#3', Q, { type: 'quarter', staff: 2 })}
  </measure>`,

  // 16: the sustain pedal, printed with signs: "Ped." … "✱". The left hand's arpeggio keeps
  // sounding under the pedal. The bass slur from bar 15 ends here.
  `<measure number="16">
    ${direction('Pedal', '')}
    ${note('F#5', Q, { type: 'quarter' })}${note('A5', Q, { type: 'quarter' })}${note('D6', H, { type: 'half' })}
    ${backup(W)}
    ${pedal('start')}
    ${['A2', 'D3', 'F#3', 'A3'].map((n, i) => note(n, E, { type: 'eighth', staff: 2, stem: 'up', beams: [run(4)[i]], slur: i === 0 ? [{ type: 'stop', number: 2 }] : [] })).join('')}
    ${['D4', 'A3', 'F#3', 'D3'].map((n, i) => note(n, E, { type: 'eighth', staff: 2, stem: 'up', beams: [run(4)[i]] })).join('')}
    ${pedal('stop')}
  </measure>`,
  // 17: pedal changes, printed as a bracket line with a notch: each short bass note rings on
  // through its rest, and the change keeps the two harmonies apart.
  `<measure number="17">
    ${direction('Pedal change', '')}
    ${chord(['B4', 'D5', 'G5'], H, { type: 'half' })}${chord(['C#5', 'E5', 'A5'], H, { type: 'half' })}
    ${backup(W)}
    ${pedal('start', 'line')}${note('G2', Q, { type: 'quarter', staff: 2 })}${rest(Q, { type: 'quarter', staff: 2 })}
    ${pedal('change', 'line')}${note('A2', Q, { type: 'quarter', staff: 2 })}${rest(Q, { type: 'quarter', staff: 2 })}
    ${pedal('stop', 'line')}
  </measure>`,

  // 18: the middle (sostenuto) pedal catches the bass note that is down when it is pressed; the
  // staccato chords after it stay short.
  `<measure number="18">
    ${direction('Sostenuto', '')}
    ${rest(Q, { type: 'quarter' })}
    ${['A4', 'B4', 'C#5'].map((n) => chord([n, 'E5'], Q, { type: 'quarter', articulations: ['staccato'] })).join('')}
    ${backup(W)}
    ${sostenuto('start')}${note('D2', Q, { type: 'quarter', staff: 2 })}${rest(Q, { type: 'quarter', staff: 2 })}${rest(H, { type: 'half', staff: 2 })}
    ${sostenuto('stop')}
  </measure>`,

  // 19: seconds in chords. One head of each second moves to the other side of the stem: the upper
  // one right of an up-stem (with the dot beyond it), the lower one left of a down-stem (the
  // natural keeps clear of it); a cluster alternates; ledger lines reach under moved heads.
  `<measure number="19">
    ${direction('Seconds', '')}
    ${chord(['A4', 'B4', 'D5'], dotted(H), { type: 'half', dots: 1, stem: 'up' })}${chord(['E5', 'F#5', 'G5'], Q, { type: 'quarter', stem: 'down' })}
    ${backup(W)}
    ${chord(['D3', 'E3', 'A3'], H, { type: 'half', staff: 2, stem: 'up' })}${note('B1', H, { type: 'half', staff: 2, stem: 'down' })}${note('C2', H, { type: 'half', staff: 2, stem: 'down', accidental: 'natural', chord: true })}
  </measure>`,

  // 20: grace notes. An acciaccatura (struck through) crushed in before the bar's first note; an
  // appoggiatura leaning on the beat, taking half of the half note it is slurred to; two small
  // sixteenths under one beam, the first with its own sharp; in the left hand, an acciaccatura an
  // octave below its note.
  `<measure number="20">
    ${direction('Grace notes', '')}
    ${note('E5', 0, { type: 'eighth', grace: { slash: true }, stem: 'up' })}${note('F#5', Q, { type: 'quarter' })}
    ${note('B5', 0, { type: 'eighth', grace: { slash: false }, stem: 'up', slur: [{ type: 'start' }] })}${note('A5', H, { type: 'half', slur: [{ type: 'stop' }] })}
    ${note('G#5', 0, { type: '16th', grace: { slash: false }, stem: 'up', accidental: 'sharp', beams: ['begin', 'begin'] })}${note('A5', 0, { type: '16th', grace: { slash: false }, stem: 'up', beams: ['end', 'end'] })}${note('B5', Q, { type: 'quarter' })}
    ${backup(W)}
    ${note('D2', 0, { type: 'eighth', grace: { slash: true }, staff: 2, stem: 'up' })}${note('D3', H, { type: 'half', staff: 2 })}${note('A2', H, { type: 'half', staff: 2 })}
  </measure>`,

  // 21–25: repeats and jumps. Played: 21 22 | 21 23 24 | D.S. → 21 23 | To Coda → 25.
  // 21: segno and ‖:.
  `<measure number="21">
    ${repeatStart}
    ${sign('segno')}
    ${direction('Repeats', '')}
    ${['D5', 'E5', 'F#5', 'G5'].map((n) => note(n, Q, { type: 'quarter' })).join('')}
    ${backup(W)}${note('A2', H, { type: 'half', staff: 2 })}${note('D3', H, { type: 'half', staff: 2 })}
  </measure>`,
  // 22: first ending, back to ‖:.
  `<measure number="22">
    ${endingStart(1)}
    ${note('A5', H, { type: 'half' })}${note('F#5', H, { type: 'half' })}
    ${backup(W)}${note('D3', W, { type: 'whole', staff: 2 })}
    ${endingStop(1, 'stop')}${repeatEnd}
  </measure>`,
  // 23: second ending; after the D.S. it leads to the coda.
  `<measure number="23">
    ${endingStart(2)}
    ${direction('To Coda', 'tocoda="coda"')}
    ${note('B5', H, { type: 'half' })}${note('A5', H, { type: 'half' })}
    ${backup(W)}${note('G2', W, { type: 'whole', staff: 2 })}
    ${endingStop(2, 'discontinue')}
  </measure>`,
  // 24: back to the segno.
  `<measure number="24">
    ${direction('D.S. al Coda', 'dalsegno="segno"')}
    ${note('E5', H, { type: 'half' })}${note('C#5', H, { type: 'half' })}
    ${backup(W)}${note('A2', W, { type: 'whole', staff: 2 })}
  </measure>`,

  // 25: the coda — the end, with fermatas over and (inverted) under the last chords, and the pedal
  // printed both ways at once: "Ped." and a line.
  `<measure number="25">
    ${sign('coda')}
    ${chord(['D5', 'F#5', 'A5'], W, { type: 'whole', fermata: 'upright' })}
    ${backup(W)}${pedal('start', 'both')}${chord(['D2', 'D3'], W, { type: 'whole', staff: 2, fermata: 'inverted' })}${pedal('stop', 'both')}
    <barline location="right"><bar-style>light-heavy</bar-style></barline>
  </measure>`,
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/showcase.ts — edit that file, then run: npm run showcase -->
<score-partwise version="4.0">
  <work><work-title>Claviano showcase</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
${measures.map((m) => '    ' + m.replace(/\n\s*/g, '')).join('\n')}
  </part>
</score-partwise>
`;

const path = new URL('../public/demos/showcase.musicxml', import.meta.url);
writeFileSync(path, xml);
console.log(`Wrote ${path.pathname} (${measures.length} measures, ${xml.length} bytes)`);
