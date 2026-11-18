import type { BarNavigation } from '../../domain/notation/navigation';
import type { Notation } from '../../domain/notation/notation';
import { durationBeats, flagCount } from '../../domain/notation/noteValue';
import { sameMoment, SAME_MOMENT } from '../../domain/moment';
import { barLengthInBeats } from '../../domain/score';
import type { WrittenGrace, WrittenNote, WrittenRest } from '../../domain/notation/written';
import { midiOf } from '../../domain/notation/spelling';

// Also expresses seven equal subdivisions without rounding their onsets or durations.
const DIVISIONS = 3360;
const TYPES = { whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth', sixteenth: '16th', thirtySecond: '32nd' };

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pitchXml({ pitch, sounding }: WrittenNote | WrittenGrace): string {
  // The MusicXML pitch includes octave-clef and octave-line transposition.
  const octave = pitch.octave + (sounding - midiOf(pitch)) / 12;
  const alteration = pitch.alteration ? `<alter>${pitch.alteration}</alter>` : '';
  return `<pitch><step>${'CDEFGAB'[pitch.letter]}</step>${alteration}<octave>${octave}</octave></pitch>`;
}

function accidentalText(accidental: NonNullable<WrittenNote['accidental']>): string {
  return accidental === 'double-flat' ? 'flat-flat' : accidental;
}

function accidentalXml(accidental: WrittenNote['accidental']): string {
  return accidental ? `<accidental>${accidentalText(accidental)}</accidental>` : '';
}

function ornamentsXml(note: WrittenNote): string {
  const marks = [];
  for (const { kind, below, accidentalAbove, accidentalBelow } of note.ornaments) {
    const tag = kind === 'trill' ? 'trill-mark' : kind;
    marks.push(`<${tag} placement="${below ? 'below' : 'above'}"/>`);
    if (accidentalAbove) marks.push(`<accidental-mark placement="above">${accidentalText(accidentalAbove)}</accidental-mark>`);
    if (accidentalBelow) marks.push(`<accidental-mark placement="below">${accidentalText(accidentalBelow)}</accidental-mark>`);
  }
  if (note.trillLine) marks.push('<wavy-line type="start" number="1"/><wavy-line type="stop" number="1"/>');
  if (note.tremolo) marks.push(`<tremolo type="${note.tremolo.type}">${note.tremolo.strokes}</tremolo>`);
  return marks.length ? '<ornaments>' + marks.join('') + '</ornaments>' : '';
}

function graceGroupXml(notes: readonly WrittenGrace[], principal: WrittenNote): string {
  const heads = notes.filter(note => !note.chord);
  const first = heads[0];
  const beams = first && heads.length > 1 && heads.every(note => note.value === first.value && note.staff === first.staff)
    ? flagCount(first.value) : 0;
  const slurStops = principal.slurs.filter(slur => slur.type === 'stop');
  let slot = -1;
  let slur = 0;
  return notes.map(grace => {
    const parts = ['<note>', grace.slash ? '<grace slash="yes"/>' : '<grace/>', grace.chord ? '<chord/>' : '',
      pitchXml(grace), `<voice>${xmlText(principal.voice)}</voice><type>${TYPES[grace.value]}</type>`,
      accidentalXml(grace.accidental), `<staff>${grace.staff}</staff>`];
    if (!grace.chord) {
      slot++;
      const beam = slot === 0 ? 'begin' : slot === heads.length - 1 ? 'end' : 'continue';
      for (let level = 1; level <= beams; level++) parts.push(`<beam number="${level}">${beam}</beam>`);
    }
    if (grace.slur) parts.push(`<notations><slur type="start" number="${slurStops[slur++]?.number ?? 1}"/></notations>`);
    return parts.join('') + '</note>';
  }).join('');
}

function noteXml(note: WrittenNote): string {
  const { duration } = note;
  const parts = [note.hidden ? '<note print-object="no">' : '<note>', note.chord ? '<chord/>' : '', pitchXml(note),
    `<duration>${Math.round(note.beats * DIVISIONS)}</duration>`,
    note.tieStop ? '<tie type="stop"/>' : '', note.tieStart ? '<tie type="start"/>' : '',
    `<voice>${xmlText(note.voice)}</voice><type${note.small ? ' size="cue"' : ''}>${TYPES[duration.value]}</type>`, '<dot/>'.repeat(duration.dots),
    accidentalXml(note.accidental)];
  if (note.tuplet) parts.push(`<time-modification><actual-notes>${note.tuplet.actual}</actual-notes><normal-notes>${note.tuplet.normal}</normal-notes></time-modification>`);
  if (note.stem) parts.push(`<stem>${note.stem}</stem>`);
  if (note.headless || note.parenthesized) parts.push(`<notehead${note.parenthesized ? ' parentheses="yes"' : ''}>${note.headless ? 'none' : 'normal'}</notehead>`);
  parts.push(`<staff>${note.staff}</staff>`);
  note.beams.forEach((mark, i) => parts.push(`<beam number="${i + 1}">${mark}</beam>`));
  const marks = [];
  if (note.tieStop) marks.push('<tied type="stop"/>');
  if (note.tieStart) marks.push('<tied type="start"/>');
  if (note.tupletStart) {
    const { bracket, showNumber } = note.tupletStart;
    marks.push(`<tuplet type="start" show-number="${showNumber ? 'actual' : 'none'}"${bracket === null ? '' : ` bracket="${bracket ? 'yes' : 'no'}"`}/>`);
  }
  if (note.tupletStop) marks.push('<tuplet type="stop"/>');
  for (const slur of note.slurs) {
    marks.push(`<slur type="${slur.type}" number="${slur.number}"${slur.placement ? ` placement="${slur.placement}"` : ''}/>`);
  }
  if (note.articulations.length) {
    const tags = note.articulations.map(mark => mark === 'marcato' ? 'strong-accent' : mark === 'portato' ? 'detached-legato' : mark);
    marks.push('<articulations>' + tags.map(tag => `<${tag}/>`).join('') + '</articulations>');
  }
  if (note.fingering) {
    const { text, below } = note.fingering;
    const placement = below == null ? '' : ` placement="${below ? 'below' : 'above'}"`;
    marks.push(`<technical><fingering${placement}>${xmlText(text)}</fingering></technical>`);
  }
  if (note.fermata) marks.push(`<fermata type="${note.fermata}"/>`);
  const ornaments = ornamentsXml(note);
  if (ornaments) marks.push(ornaments);
  if (note.arpeggio) marks.push(note.arpeggio === 'down' ? '<arpeggiate direction="down"/>' : '<arpeggiate/>');
  if (marks.length) parts.push('<notations>', ...marks, '</notations>');
  return parts.join('') + '</note>';
}

function clefXml({ staff, clef, octaves }: Pick<Notation['clefs'][number], 'staff' | 'clef' | 'octaves'>): string {
  const sign = clef === 'treble' ? '<sign>G</sign><line>2</line>' : '<sign>F</sign><line>4</line>';
  const shift = octaves ? `<clef-octave-change>${octaves}</clef-octave-change>` : '';
  return `<clef number="${staff}">${sign}${shift}</clef>`;
}

function attributesXml(notation: Notation, beat: number, first: boolean): string {
  const atStart = (item: { beat: number }) => sameMoment(item.beat, beat);
  const key = notation.keySignatures.find(atStart);
  const time = notation.timeSignatures.find(atStart);
  const parts = [];
  if (first) parts.push(`<divisions>${DIVISIONS}</divisions>`);
  if (key) parts.push(`<key><fifths>${key.fifths}</fifths><mode>${key.minor ? 'minor' : 'major'}</mode></key>`);
  if (time) parts.push(`<time><beats>${time.numerator}</beats><beat-type>${time.denominator}</beat-type></time>`);
  if (first) parts.push('<staves>2</staves>');
  for (const { staff, clef, octaves } of notation.clefs.filter(atStart)) {
    parts.push(clefXml({ staff, clef, octaves }));
  }
  return parts.length ? '<attributes>' + parts.join('') + '</attributes>' : '';
}

function tempoXml(notation: Notation, bar: number, beat: number, start: number): string {
  const mark = notation.tempoMarks.find(item => item.printed !== false && sameMoment(item.beat, beat));
  const change = notation.tempos.find(item => item.bar === bar && sameMoment(item.beat, beat));
  const sound = change ? `<sound tempo="${change.bpm}"/>` : '';
  const offset = beat === start ? '' : `<offset>${Math.round((beat - start) * DIVISIONS)}</offset>`;
  if (!mark) return offset && change ? `<sound tempo="${change.bpm}">${offset}</sound>` : sound;
  return `<direction placement="above"><direction-type><metronome><beat-unit>${TYPES[mark.unit.value]}</beat-unit>`
    + '<beat-unit-dot/>'.repeat(mark.unit.dots)
    + `<per-minute>${mark.perMinute}</per-minute></metronome></direction-type>${offset}<staff>1</staff>${sound}</direction>`;
}

function restXml(rest: WrittenRest, length: number): string {
  const pitch = rest.displayPitch;
  const position = pitch ? `<display-step>${'CDEFGAB'[pitch.letter]}</display-step><display-octave>${pitch.octave}</display-octave>` : '';
  return `<note><rest${rest.measure ? ' measure="yes"' : ''}>${position}</rest><duration>${length}</duration>`
    + `<voice>${xmlText(rest.voice)}</voice><type>${TYPES[rest.duration.value]}</type>`
    + '<dot/>'.repeat(rest.duration.dots) + `<staff>${rest.staff}</staff></note>`;
}

function navigationBarline(nav: BarNavigation, left: boolean): string {
  const marks = [];
  const numbers = nav.ending?.join(', ');
  if (numbers && left && nav.endingLabel) {
    marks.push(`<ending number="${numbers}" type="start">${xmlText(nav.endingLabel)}</ending>`);
  } else if (numbers && !left && nav.endingClosed !== undefined) {
    marks.push(`<ending number="${numbers}" type="${nav.endingClosed ? 'stop' : 'discontinue'}"/>`);
  }
  if (left && nav.repeatStart) marks.push('<repeat direction="forward"/>');
  if (!left && nav.repeatEnd) marks.push(`<repeat direction="backward" times="${nav.repeatEnd.times}"/>`);
  return marks.length ? `<barline location="${left ? 'left' : 'right'}">${marks.join('')}</barline>` : '';
}

function navigationDirections(nav: BarNavigation): string {
  const directions = [];
  for (const sign of ['segno', 'coda'] as const) {
    const printed = sign === 'segno' ? nav.segnoSign : nav.codaSign;
    const sound = nav[sign] ? `<sound ${sign}="${sign}"/>` : '';
    if (printed) directions.push(`<direction placement="above"><direction-type><${sign}/></direction-type>${sound}</direction>`);
    else if (sound) directions.push(sound);
  }
  return directions.join('');
}

function navigationJump(nav: BarNavigation): string {
  const jumps = [nav.jump === 'dalsegno' && 'dalsegno="segno"', nav.jump === 'dacapo' && 'dacapo="yes"',
    nav.toCoda && 'tocoda="coda"', nav.fine && 'fine="yes"'].filter(Boolean);
  if (!jumps.length) return '';
  const sound = `<sound ${jumps.join(' ')}/>`;
  return nav.text ? `<direction placement="above"><direction-type><words>${xmlText(nav.text)}</words></direction-type>${sound}</direction>` : sound;
}

/** Serializes the two-staff, complete-voice subset produced by readPianoPreview. */
export function writePdfPreviewMusicXml(notation: Notation): string {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<score-partwise version="4.0">',
    `<work><work-title>${xmlText(notation.title)}</work-title></work>`,
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'];
  const first = notation.bars[0];
  const meter = notation.timeSignatures[0];
  const pickup = (notation.pickup || notation.bars.length > 1) && first && meter && first.length < barLengthInBeats(meter) - SAME_MOMENT;
  const graceGroups = new Map<WrittenNote, WrittenGrace[]>();
  for (const { leadsTo, notes } of notation.graces) {
    const principal = leadsTo === null ? undefined : notation.notes[leadsTo];
    if (!principal) continue;
    const group = graceGroups.get(principal) ?? [];
    group.push(...notes);
    graceGroups.set(principal, group);
  }
  for (const [index, bar] of notation.bars.entries()) {
    const number = index + (pickup ? 0 : 1);
    parts.push(`<measure number="${number}"${pickup && index === 0 ? ' implicit="yes"' : ''}>`);
    parts.push(navigationBarline(bar.navigation, true), attributesXml(notation, bar.start, index === 0),
      navigationDirections(bar.navigation));
    const tempoBeats = new Set([...notation.tempoMarks, ...notation.tempos].filter(mark =>
      mark.beat >= bar.start && mark.beat < bar.start + bar.length).map(mark => mark.beat));
    for (const beat of [...tempoBeats].sort((a, b) => a - b)) parts.push(tempoXml(notation, index, beat, bar.start));
    // The bar index distinguishes a release on the preceding barline from a new press.
    for (const mark of notation.pedalMarks) {
      // A printed change produces both an up and a down move at the same beat.
      // Write the mark once, at the bar of its corresponding move.
      const movedHere = notation.pedalMoves.some(move => move.bar === index && move.pedal === mark.pedal
        && sameMoment(move.beat, mark.beat) && move.down === (mark.type !== 'stop'));
      if (!movedHere) continue;
      const type = mark.pedal === 'sostenuto' && mark.type === 'start' ? 'sostenuto' : mark.type;
      const sign = mark.pedal === 'soft' && mark.text ? `<words font-style="italic">${xmlText(mark.text)}</words>`
        : `<pedal type="${type}" number="${mark.pedal === 'sostenuto' ? 2 : 1}" sign="${mark.sign ? 'yes' : 'no'}" line="${mark.line ? 'yes' : 'no'}"/>`;
      parts.push(`<direction placement="below"><direction-type>${sign}</direction-type>`,
        `<offset>${Math.round((mark.beat - bar.start) * DIVISIONS)}</offset><staff>2</staff></direction>`);
    }
    const inBar = ({ beat }: { beat: number }) => beat >= bar.start && beat < bar.start + bar.length;
    const offset = (beat: number) => `<offset>${Math.round((beat - bar.start) * DIVISIONS)}</offset>`;
    const barEnd = bar.start + bar.length;
    const wedges = notation.hairpins.filter(hairpin => hairpin.drawn).flatMap((hairpin, i) => {
      const endpoints = [];
      if (inBar({ beat: hairpin.start })) endpoints.push({ beat: hairpin.start, type: hairpin.type });
      // A stop on the barline closes in the preceding measure, including the final bar.
      if (hairpin.end > bar.start + SAME_MOMENT && hairpin.end <= barEnd + SAME_MOMENT) {
        endpoints.push({ beat: hairpin.end, type: 'stop' });
      }
      return endpoints.map(endpoint => ({ ...endpoint, number: i + 1, below: hairpin.below }));
    }).sort((a, b) => a.beat - b.beat || Number(b.type === 'stop') - Number(a.type === 'stop'));
    for (const wedge of wedges) {
      parts.push(`<direction placement="below"><direction-type><wedge type="${wedge.type}" number="${wedge.number}"/>`,
        `</direction-type>${offset(wedge.beat)}<staff>${wedge.below ? 2 : 1}</staff></direction>`);
    }
    for (const mark of notation.dynamics.filter(inBar)) {
      const letters = /^(?:p{1,6}|f{1,6}|m[pf]|sf|sfp|sfpp|fp|rf|rfz|sfz|sffz|fz)$/.test(mark.text)
        ? `<${mark.text}/>` : `<other-dynamics>${xmlText(mark.text)}</other-dynamics>`;
      const dynamic = mark.letters ? `<dynamics>${letters}</dynamics>` : `<words font-style="italic">${xmlText(mark.text)}</words>`;
      parts.push(`<direction placement="below"><direction-type>${dynamic}</direction-type>`,
        offset(mark.beat), `<staff>${mark.below ? 2 : 1}</staff></direction>`);
    }
    for (const words of notation.words.filter(inBar)) {
      parts.push(`<direction placement="${words.below ? 'below' : 'above'}"><direction-type>`,
        `<words ${words.tempo ? 'font-weight="bold"' : 'font-style="italic"'}>${xmlText(words.text)}</words></direction-type>`,
        offset(words.beat), '<staff>1</staff></direction>');
    }
    const voices = new Map<string, (WrittenNote | WrittenRest)[]>();
    for (const event of [...notation.notes.filter(n => n.bar === index), ...notation.rests.filter(inBar)]) {
      const id = event.staff + '/' + event.voice;
      const voice = voices.get(id) ?? [];
      voice.push(event);
      voices.set(id, voice);
    }
    const shifts = notation.octaveShifts.flatMap(({ staff, octaves, start, end }) => {
      const marks = [];
      if (end > bar.start && end <= barEnd) marks.push({ staff, octaves, beat: end, type: 'stop' });
      if (start >= bar.start && start < barEnd) marks.push({ staff, octaves, beat: start, type: octaves > 0 ? 'down' : 'up' });
      return marks;
    }).sort((a, b) => a.beat - b.beat || Number(b.type === 'stop') - Number(a.type === 'stop'));
    let cursor = 0;
    const emitted = new Set<number>();
    for (const voice of voices.values()) {
      const staff = voice[0]!.staff;
      if (emitted.has(staff)) continue;
      const marks = shifts.filter(mark => mark.staff === staff);
      // Order all voices on this staff by beat when an octave line changes, so
      // the same bracket covers every simultaneous voice on reopening.
      const clefs = notation.clefs.filter(c => c.staff === staff && c.beat > bar.start && c.beat < barEnd).sort((a, b) => a.beat - b.beat);
      const combine = marks.length || clefs.length;
      const events = combine ? [...voices.values()].filter(group => group[0]!.staff === staff).flat() : voice;
      if (combine) emitted.add(staff);
      let nextClef = 0;
      let next = 0;
      const writeShiftsThrough = (beat: number) => {
        while (next < marks.length && marks[next]!.beat <= beat) {
          const mark = marks[next++]!;
          const ticks = Math.round((mark.beat - bar.start) * DIVISIONS) - cursor;
          parts.push(`<direction placement="${mark.octaves > 0 ? 'above' : 'below'}"><direction-type>`,
            `<octave-shift type="${mark.type}" size="${7 * Math.abs(mark.octaves) + 1}"/></direction-type>`,
            `<offset>${ticks}</offset><staff>${staff}</staff></direction>`);
        }
      };
      for (const event of events.sort((a, b) => a.beat - b.beat)) {
        while (nextClef < clefs.length && clefs[nextClef]!.beat <= event.beat) {
          const clef = clefs[nextClef++]!;
          const target = Math.round((clef.beat - bar.start) * DIVISIONS);
          if (target !== cursor) {
            const tag = target < cursor ? 'backup' : 'forward';
            parts.push(`<${tag}><duration>${Math.abs(target - cursor)}</duration></${tag}>`);
            cursor = target;
          }
          parts.push('<attributes>', clefXml(clef), '</attributes>');
        }
        writeShiftsThrough(event.beat);
        const onset = Math.round((event.beat - bar.start) * DIVISIONS);
        if ('chord' in event && event.chord) {
          parts.push(noteXml(event));
          continue;
        }
        if (cursor !== onset) {
          const tag = cursor > onset ? 'backup' : 'forward';
          parts.push(`<${tag}><duration>${Math.abs(cursor - onset)}</duration></${tag}>`);
        }
        if ('pitch' in event) {
          const graces = graceGroups.get(event);
          if (graces) parts.push(graceGroupXml(graces, event));
          parts.push(noteXml(event));
          cursor = onset + Math.round(event.beats * DIVISIONS);
        } else {
          const beats = event.measure ? bar.length : durationBeats(event.duration);
          const length = Math.round(beats * DIVISIONS);
          parts.push(restXml(event, length));
          cursor = onset + length;
        }
      }
      writeShiftsThrough(barEnd);
    }
    const jump = navigationJump(bar.navigation);
    if (jump) {
      const remaining = Math.round(bar.length * DIVISIONS) - cursor;
      if (remaining) {
        const tag = remaining > 0 ? 'forward' : 'backup';
        parts.push(`<${tag}><duration>${Math.abs(remaining)}</duration></${tag}>`);
      }
      parts.push(jump);
    }
    parts.push(navigationBarline(bar.navigation, false), '</measure>');
  }
  return parts.join('') + '</part></score-partwise>';
}
