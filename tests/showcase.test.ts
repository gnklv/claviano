// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * End-to-end check on the showcase score (public/demos/showcase.musicxml, built by
 * scripts/showcase.ts): it is parsed and laid out, and every feature it demonstrates shows up.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { barNumber, hasPickup } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { layoutNotation } from '../src/infrastructure/render/notationLayout';
import { layoutPedal } from '../src/infrastructure/render/pedalLayout';
import { signatureChanges } from '../src/infrastructure/render/staffLayout';
import { soundingDurations } from '../src/domain/pedal';

// Tests run from the project root; in happy-dom import.meta.url is not a file path.
const file = readFileSync('public/demos/showcase.musicxml');
const score = new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
const layout = layoutNotation(score);

/** Chords of one bar (by printed number) on one staff, left to right. */
const chordsIn = (number: number, staff: 'treble' | 'bass' = 'treble') =>
  layout.chords.filter((c) => barNumber(score, c.bar) === number && c.staff === staff).sort((a, b) => a.x - b.x);

describe('showcase score', () => {
  it('opens with a pickup and numbers bars 0–27', () => {
    expect(score.title).toBe('Claviano showcase');
    expect(hasPickup(score)).toBe(true);
    expect(barNumber(score, 0)).toBe(0);
    expect(barNumber(score, score.bars.length - 1)).toBe(27);
  });

  it('has every note value, dotted ones and ledger lines', () => {
    const values = new Set(layout.chords.map((c) => c.duration.value));
    expect([...values].sort()).toEqual(['eighth', 'half', 'quarter', 'sixteenth', 'thirtySecond', 'whole']);
    expect(layout.chords.some((c) => c.duration.dots === 1)).toBe(true);
    expect(chordsIn(1)[0].ledgerSteps.length).toBeGreaterThan(0); // Do6 above the staff
    expect(chordsIn(1, 'bass')[0].ledgerSteps.length).toBeGreaterThan(0); // Do2 below the staff
  });

  it('beams as written, up to three levels', () => {
    const thirtySeconds = chordsIn(2).filter((c) => c.duration.value === 'thirtySecond');
    expect(thirtySeconds).toHaveLength(8);
    const beam = thirtySeconds[0].beam;
    expect(beam).not.toBeNull();
    expect(thirtySeconds.every((c) => c.beam === beam)).toBe(true);
  });

  it('prints the accidentals of bar 4 as written', () => {
    expect(chordsIn(4).map((c) => c.notes[0].accidental)).toEqual([
      'sharp',
      null,
      'natural',
      'flat',
      'natural',
      'double-sharp',
      'double-flat',
      'natural',
    ]);
  });

  it('shows the tuplets of bar 5: numbers, a hidden one, a quintuplet and a bracket', () => {
    const inBar5 = layout.tuplets.filter((t) => barNumber(score, layout.chords[t.chords[0]].bar) === 5);
    const summary = inBar5.map((t) => [t.number, t.showNumber, t.bracket]).sort();
    expect(summary).toEqual([
      [3, false, false], // hidden number
      [3, true, false], // beamed triplet
      [3, true, true], // quarter triplet in the bass, with a bracket
      [5, true, false], // quintuplet
    ]);
  });

  it('writes two voices with opposite stems in bar 6, and a whole-bar rest below', () => {
    const [upper] = chordsIn(6).filter((c) => c.notes.length === 3);
    const lower = chordsIn(6).filter((c) => c.notes.length === 1);
    expect(upper.stemUp).toBe(true);
    expect(lower.every((c) => !c.stemUp)).toBe(true);
    const wholeBar = layout.rests.find((r) => r.staff === 'bass' && r.duration.value === 'whole');
    expect(wholeBar).toBeDefined();
  });

  it('moves the up-stem voice right where the voices of bar 6 meet a second apart', () => {
    const upper = chordsIn(6).filter((c) => c.stemUp);
    expect(upper.map((c) => !!c.voiceShift)).toEqual([false, true]); // Re5 (with Fa5 Si5) over Do5
    expect(chordsIn(6).filter((c) => !c.stemUp).every((c) => !c.voiceShift)).toBe(true);
  });

  it('has rests of every value', () => {
    const values = new Set(layout.rests.map((r) => r.duration.value));
    expect(values).toEqual(new Set(['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond']));
  });

  it('ties notes across a bar line and in a chord, above and below', () => {
    expect(layout.ties).toHaveLength(4);
    const chordTies = layout.ties.filter((t) => layout.chords[t.from].notes.length === 2);
    expect(chordTies.map((t) => t.above).sort()).toEqual([false, true]);
    // Sounding: the tied Sol4 is one note of 2 + 2 + 1 quarters.
    const sol = score.notes.find((n) => n.pitch === pitch('Sol', 4) && n.beats === 5);
    expect(sol).toBeDefined();
  });

  it('changes key, metre, clef, tempo and loudness along the way', () => {
    expect(score.keySignatures.map((k) => k.fifths)).toEqual([0, -3, 2]);
    expect(score.timeSignatures.map((t) => `${t.numerator}/${t.denominator}`)).toEqual(['4/4', '6/8', '4/4']);
    expect(score.clefs.filter((c) => c.staff === 2).map((c) => c.clef)).toEqual(['bass', 'treble', 'bass']);
    // Bars 10 and 12 are both 6/8, but bar 12 is at 60 instead of 90, so it lasts longer.
    // (With the pickup, a bar's index equals its printed number.)
    const seconds = (bar: number) => score.bars[bar + 1] - score.bars[bar];
    expect(seconds(12)).toBeCloseTo(seconds(10) * 1.5);
    const quiet = score.notes.find((n) => n.pitch === pitch('Sib', 4) && n.beats === 3)!;
    const loud = score.notes.find((n) => n.pitch === pitch('La', 6))!;
    expect(loud.velocity).toBeGreaterThan(quiet.velocity);
  });

  it('spans from La0 to La6, wide enough for the keyboard to scroll on a phone', () => {
    const pitches = score.notes.map((n) => n.pitch);
    expect(Math.min(...pitches)).toBe(pitch('La', 0));
    expect(Math.max(...pitches)).toBe(pitch('La', 6));
  });

  it('places articulations away from the stems, stacking several outward', () => {
    const marksIn = (number: number, staff: 'treble' | 'bass') =>
      layout.marks.filter((m) => layout.chords[m.chord].staff === staff && barNumber(score, layout.chords[m.chord].bar) === number);
    const upper = marksIn(14, 'treble');
    expect(upper.map((m) => m.kind)).toEqual(['staccato', 'tenuto', 'accent', 'marcato']);
    expect(upper.every((m) => m.above)).toBe(true); // stems down
    const lower = marksIn(14, 'bass');
    expect(lower.every((m) => !m.above)).toBe(true); // stems up
    const stacked = lower.filter((m) => m.chord === lower.find((x) => x.kind === 'accent')!.chord);
    expect(stacked.map((m) => m.kind)).toEqual(['staccato', 'accent']);
    expect(stacked[1].step).toBeGreaterThan(stacked[0].step); // the accent further out (below)
  });

  it('draws fermatas over and, inverted, under', () => {
    const fermatas = layout.marks.filter((m) => m.kind === 'fermata');
    expect(fermatas.map((m) => m.above).sort()).toEqual([false, true, true]);
  });

  it('draws slurs above a leaping melody and below the bass, across the bar line', () => {
    expect(layout.slurs).toHaveLength(2);
    const [upper, lower] = [...layout.slurs].sort((a, b) => Number(b.above) - Number(a.above));
    expect(upper.above).toBe(true);
    expect(upper.between).toHaveLength(2);
    expect(lower.above).toBe(false);
    expect(barNumber(score, layout.chords[lower.to].bar)).toBe(16);
  });

  it('makes staccato sound shorter and accents louder', () => {
    const inBar14 = score.notes.filter((n) => n.hand === 'right' && n.beat >= score.barBeats[14] && n.beat < score.barBeats[15]);
    const [staccato, tenuto, accent] = inBar14;
    expect(staccato.duration).toBeCloseTo(tenuto.duration / 2);
    expect(accent.velocity).toBeGreaterThan(tenuto.velocity);
  });

  it('prints the grace notes of bar 20 small before their notes, and plays them by their kind', () => {
    const graces = layout.graces.filter((g) => barNumber(score, g.bar) === 20);
    expect(graces.map((g) => [g.staff, g.slots.length, g.slash, g.beams, g.slur])).toEqual([
      ['treble', 1, true, 1, false],
      ['treble', 1, false, 1, true],
      ['treble', 2, false, 2, false],
      ['bass', 1, true, 1, false],
    ]);
    expect(graces[2].slots[0].notes[0].accidental).toBe('sharp');
    // Each stands before a chord of the bar.
    expect(graces.every((g) => g.principal !== null && barNumber(score, layout.chords[g.principal].bar) === 20)).toBe(true);

    const bar = score.barBeats[20];
    const played = score.notes
      .filter((n) => n.hand === 'right' && n.beat >= bar - 0.5 && n.beat < bar + 4)
      .map((n) => [n.pitch, n.beat - bar, n.beats]);
    expect(played).toEqual([
      [pitch('Mi', 5), -0.125, 0.125], // the acciaccatura, before the bar line
      [pitch('Fa#', 5), 0, 1],
      [pitch('Si', 5), 1, 1], // the appoggiatura: half of the half note
      [pitch('La', 5), 2, 1],
      [pitch('Sol#', 5), 2.75, 0.125], // the two small sixteenths
      [pitch('La', 5), 2.875, 0.125],
      [pitch('Si', 5), 3, 1],
    ]);
  });

  it('prints the ornaments of bar 21 over their notes, and plays each as its notes', () => {
    const inBar = (number: number) => (o: { chord: number }) => barNumber(score, layout.chords[o.chord].bar) === number;
    const signs = layout.ornaments.filter(inBar(21));
    expect(signs.map((o) => [layout.chords[o.chord].staff, o.kind, o.accidentalBelow, o.lineTo !== null])).toEqual([
      ['treble', 'trill', null, true],
      ['bass', 'turn', null, false],
      ['treble', 'mordent', null, false],
      ['bass', 'delayed-turn', 'natural', false],
      ['treble', 'inverted-mordent', null, false],
    ]);

    const bar = score.barBeats[21];
    const played = (hand: string) => score.notes.filter((n) => n.hand === hand && n.beat >= bar && n.beat < bar + 4).map((n) => n.pitch);
    const [a, b, fSharp, e] = [pitch('La', 5), pitch('Si', 5), pitch('Fa#', 5), pitch('Mi', 5)];
    // The trill: La and Si in turn through the half note, ending on La; then the two mordents.
    expect(played('right')).toEqual([...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? a : b)), fSharp, e, fSharp, e, fSharp, e]);
    // The turn around Fa#; then Re held, and a turn whose lower note is Do natural.
    expect(played('left')).toEqual([pitch('Sol', 3), pitch('Fa#', 3), pitch('Mi', 3), pitch('Fa#', 3), pitch('Re', 3), pitch('Mi', 3), pitch('Re', 3), pitch('Do', 3), pitch('Re', 3)]);
  });

  it('prints the tremolos and the rolled chord of bar 22, and plays them', () => {
    const inBar22 = (index: number) => barNumber(score, layout.chords[index].bar) === 22;
    expect(layout.tremolos.filter((t) => inBar22(t.chord)).map((t) => [layout.chords[t.chord].staff, t.strokes, t.to !== null])).toEqual([
      ['treble', 3, false],
      ['bass', 2, true],
    ]);
    const rolls = layout.arpeggios.filter((a) => inBar22(a.chords[0]));
    expect(rolls).toHaveLength(1);
    expect(rolls[0].chords.map((i) => layout.chords[i].staff).sort()).toEqual(['bass', 'treble']);

    const bar = score.barBeats[22];
    const inHalf = (from: number) => score.notes.filter((n) => n.beat >= bar + from - 1e-6 && n.beat < bar + from + 2);
    // First half: Re repeated in thirty-seconds above, Re and La in turn in sixteenths below.
    expect(inHalf(0).filter((n) => n.hand === 'right')).toHaveLength(16);
    expect(inHalf(0).filter((n) => n.hand === 'left').map((n) => n.pitch)).toEqual([50, 57, 50, 57, 50, 57, 50, 57]);
    // Second half: six notes one after another from the bottom of the left hand to the top of the right.
    const roll = inHalf(2).sort((x, y) => x.beat - y.beat);
    expect(roll.map((n) => n.pitch)).toEqual([38, 45, 54, 66, 69, 74]);
    expect(roll.every((n, i) => i === 0 || n.beat > roll[i - 1].beat)).toBe(true);
  });

  it('plays repeats, voltas, D.S. and the coda in order, while the page keeps each bar once', () => {
    // Printed bars are played in this order from bar 23 on (the pickup is bar 0, so index = number).
    const tail = score.barWritten.slice(score.barWritten.indexOf(23));
    expect(tail).toEqual([23, 24, 23, 25, 26, 23, 25, 27]);
    expect(score.writtenBarBeats).toHaveLength(28);
    expect(score.navigation[23]).toMatchObject({ repeatStart: true, segno: true, segnoSign: true });
    expect(score.navigation[24]).toMatchObject({ ending: [1], endingLabel: '1.', repeatEnd: { times: 2 } });
    expect(score.navigation[25]).toMatchObject({ ending: [2], toCoda: true, text: 'To Coda' });
    expect(score.navigation[26]).toMatchObject({ jump: 'dalsegno', text: 'D.S. al Coda' });
    expect(score.navigation[27]).toMatchObject({ coda: true, codaSign: true });
  });

  it('holds the fermata of bar 15: its half note sounds twice as long, and the bar lasts longer', () => {
    const inBar15 = (n: { beat: number }) => n.beat >= score.barBeats[15] && n.beat < score.barBeats[16];
    const held = score.notes.find((n) => inBar15(n) && n.pitch === pitch('Si', 5))!;
    const eighth = score.notes.find((n) => inBar15(n) && n.pitch === pitch('Re', 5))!;
    expect(held.duration).toBeCloseTo(eighth.duration * 8); // a half is 4 eighths, held twice as long
    const barSeconds = score.bars[16] - score.bars[15];
    expect(barSeconds).toBeCloseTo(eighth.duration * 12); // 8 eighths + 4 more for the fermata
  });

  it('holds the arpeggio of bar 16 with the pedal, printed as "Ped." … "✱"', () => {
    const start = score.bars[16];
    const end = score.bars[17];
    expect(score.pedal.find((span) => span.start === start)).toEqual({ start, end });
    const durations = soundingDurations(score.notes, score.pedal);
    const firstBass = score.notes.findIndex((n) => n.start === start && n.pitch === pitch('La', 2));
    expect(score.notes[firstBass].duration).toBeLessThan(end - start);
    expect(start + durations[firstBass]).toBeCloseTo(end); // it rings to the end of the bar
    expect(layoutPedal(score).signs.map((s) => s.kind).slice(0, 2)).toEqual(['press', 'release']);
  });

  it('changes the pedal in bar 17 on a bracket line, keeping the two harmonies apart', () => {
    const inBar17 = score.pedal.filter((span) => span.start >= score.bars[17] && span.start < score.bars[18]);
    expect(inBar17).toHaveLength(2);
    expect(inBar17[0].end).toBeCloseTo(inBar17[1].start);
    const [line] = layoutPedal(score).lines;
    expect(line.changes).toHaveLength(1);
    expect(line.afterSign).toBe(false);
  });

  it('prints the pedal of the coda as "Ped." followed by a line', () => {
    const lines = layoutPedal(score).lines.filter((l) => l.pedal === 'sustain');
    expect(lines).toHaveLength(2);
    expect(lines[1].afterSign).toBe(true);
  });

  it('plays bar 12 with the left pedal (una corda) and lifts it for the forte of bar 13', () => {
    expect(score.softPedal).toEqual([{ start: score.bars[12], end: score.bars[13] }]);
    expect(layoutPedal(score).words.map((w) => w.text)).toEqual(['una corda', 'tre corde']);
  });

  it('moves one head of each second in bar 19 to the other side of the stem', () => {
    const displaced = (staff: 'treble' | 'bass') =>
      chordsIn(19, staff).map((c) => [c.stemUp, c.notes.map((n) => !!n.displaced)]);
    expect(displaced('treble')).toEqual([
      [true, [false, true, false]], // D5 · B4 moved right of the up-stem · A4
      [false, [false, true, false]], // G5 · F#5 moved left of the down-stem · E5 (a cluster alternates)
    ]);
    expect(displaced('bass')).toEqual([
      [true, [false, true, false]], // A3 · E3 moved right · D3
      [false, [false, true]], // C2 · B1 moved left
    ]);
  });

  it('catches only the bass note of bar 18 with the middle pedal', () => {
    const start = score.bars[18];
    const end = score.bars[19];
    expect(score.sostenutoPedal).toEqual([{ start, end }]);
    const durations = soundingDurations(score.notes, score.pedal, score.sostenutoPedal);
    const inBar = score.notes.map((n, i) => ({ n, i })).filter(({ n }) => n.start >= start && n.start < end);
    const bass = inBar.find(({ n }) => n.pitch === pitch('Re', 2))!;
    expect(start + durations[bass.i]).toBeCloseTo(end); // held by the pedal to the end of the bar
    const chords = inBar.filter(({ n }) => n.hand === 'right');
    expect(chords).toHaveLength(6);
    for (const { n, i } of chords) expect(durations[i]).toBeCloseTo(n.duration); // staccato stays short
    expect(layoutPedal(score).signs.filter((s) => s.kind === 'sostenuto')).toHaveLength(1);
  });
});

describe('showcase score: changes along the way', () => {
  it('prints the key and time changes of bars 10 and 13 where they happen', () => {
    const changes = signatureChanges(score).filter((c) => c.key || c.time);
    expect(changes.map((c) => [c.bar, c.key, c.time && `${c.time.numerator}/${c.time.denominator}`])).toEqual([
      [10, { from: 0, to: -3 }, '6/8'],
      [13, { from: -3, to: 2 }, '4/4'],
    ]);
  });

  it('prints the tempo: 90 at the start, a dotted quarter in 6/8, 60 in bar 12, 90 again in bar 13', () => {
    expect(score.tempoMarks.map((m) => [m.beat, `${m.unit.value}${m.unit.dots ? '.' : ''}`, m.perMinute])).toEqual([
      [0, 'quarter', 90],
      [score.writtenBarBeats[10], 'quarter.', 60],
      [score.writtenBarBeats[12], 'quarter', 60],
      [score.writtenBarBeats[13], 'quarter', 90],
    ]);
  });

  it('prints the high notes of bar 13 under 8va and its A0 under 8vb, sounding where they should', () => {
    const start = score.writtenBarBeats[13];
    const end = score.writtenBarBeats[14];
    expect(score.octaveShifts).toEqual([
      { staff: 1, start, end, octaves: 1 },
      { staff: 2, start: start + 2, end, octaves: -1 },
    ]);
    // Printed an octave nearer…
    const printed = score.written!.filter((n) => n.beat >= start && n.beat < end).map((n) => `${'CDEFGAB'[n.pitch.letter]}${n.pitch.octave}`);
    expect(printed).toEqual(['D5', 'F5', 'A5', 'D2', 'A1']);
    // …but played where written in the file.
    expect(score.notes.some((n) => n.pitch === pitch('La', 6))).toBe(true);
    expect(score.notes.some((n) => n.pitch === pitch('La', 0))).toBe(true);
    expect(layout.octaveShifts.map((s) => [s.staff, s.octaves])).toEqual([
      ['treble', 1],
      ['bass', -1],
    ]);
  });

  it('prints p and f in bars 12 and 13, a crescendo in bar 3 and a diminuendo in bar 5', () => {
    expect(score.dynamics.map((d) => [d.text, d.beat])).toEqual([
      ['p', score.writtenBarBeats[12]],
      ['f', score.writtenBarBeats[13]],
    ]);
    expect(score.hairpins.map((h) => [h.type, h.start, h.end])).toEqual([
      ['crescendo', score.writtenBarBeats[3], score.writtenBarBeats[4]],
      ['diminuendo', score.writtenBarBeats[5], score.writtenBarBeats[6]],
    ]);
  });

  it('plays the crescendo of bar 3 louder and louder, and the diminuendo of bar 5 softer', () => {
    const rightHandIn = (bar: number) =>
      score.notes.filter((n) => n.hand === 'right' && n.beat >= score.barBeats[bar] && n.beat < score.barBeats[bar + 1]);
    const cresc = rightHandIn(3).map((n) => n.velocity);
    expect(cresc.at(-1)!).toBeGreaterThan(cresc[0]);
    expect([...cresc].sort((a, b) => a - b)).toEqual(cresc); // never softer along the way
    const dim = rightHandIn(5).map((n) => n.velocity);
    expect(dim.at(-1)!).toBeLessThan(dim[0]);
  });
});
