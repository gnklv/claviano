// @vitest-environment happy-dom
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/domain/pitch';
import { barNumber, clefSignAt } from '../src/domain/score';
import { engravePedal as layoutPedal } from '../src/domain/notation/pedalEngraving';
import { soundingDurations } from '../src/domain/pedal';
import { chordsIn, layout, score } from './showcaseScore';

describe('showcase score', () => {
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

  it('prints the eighths of bar 23 without heads where they share a note with the melody, and nothing for the hidden rest', () => {
    const voices = chordsIn(23);
    // At each half of the bar two chords stand on one note: the melody's with its head, the eighths' without.
    for (const beat of [0, 2]) {
      const shared = voices.filter((c) => Math.abs(c.beat - score.notation.bars[23].start - beat) < 1e-6);
      expect(shared.map((c) => [c.duration.value, c.stemUp, c.notes.map((n) => n.headless ?? false)])).toEqual([
        ['half', true, [false]],
        ['eighth', false, [true]],
      ]);
      expect(shared[0].notes[0].step).toBe(shared[1].notes[0].step);
    }
    // The headless eighths still lead their beams.
    const headless = layout.chords.map((c, i) => ({ c, i })).filter(({ c }) => c.notes.some((n) => n.headless));
    expect(headless).toHaveLength(2);
    expect(headless.every(({ c, i }) => c.beam !== null && layout.beams[c.beam].chords[0] === i)).toBe(true);
    // Both notes sound: the melody's half note and the eighth on the same key.
    const start = score.barBeats[score.barWritten.indexOf(23)];
    expect(score.notes.filter((n) => Math.abs(n.beat - start) < 1e-6 && n.hand === 'right').map((n) => [n.pitch, n.beats])).toEqual([
      [pitch('Re', 5), 2],
      [pitch('Re', 5), 0.5],
    ]);

    // The left hand's first half is a hidden rest: no rest is printed there, and the note comes in on time.
    const inBar = (beat: number) => beat >= score.notation.bars[23].start - 1e-6 && beat < score.notation.bars[24].start - 1e-6;
    expect(layout.rests.filter((r) => inBar(r.beat))).toEqual([]);
    expect(chordsIn(23, 'bass').map((c) => c.beat - score.notation.bars[23].start)).toEqual([2]);
  });

  it('prints bar 24 in clefs with an 8: an octave from where it sounds, and back to plain clefs after', () => {
    const start = score.notation.bars[24].start;
    const end = score.notation.bars[25].start;
    expect(clefSignAt(score, 1, start)).toEqual({ clef: 'treble', octaves: 1 });
    expect(clefSignAt(score, 2, start)).toEqual({ clef: 'bass', octaves: -1 });
    expect(clefSignAt(score, 1, end)).toEqual({ clef: 'treble', octaves: 0 });
    expect(clefSignAt(score, 2, end)).toEqual({ clef: 'bass', octaves: 0 });

    // Sounding Re6, Fa#6, La6, Fa#6 and Re2, La1…
    const played = score.barBeats[score.barWritten.indexOf(24)];
    const sounding = (hand: 'left' | 'right') => score.notes.filter((n) => n.hand === hand && n.beat >= played - 1e-6 && n.beat < played + 4 - 1e-6).map((n) => n.pitch);
    expect(sounding('right')).toEqual([pitch('Re', 6), pitch('Fa#', 6), pitch('La', 6), pitch('Fa#', 6)]);
    expect(sounding('left')).toEqual([pitch('Re', 2), pitch('La', 1)]);
    // …printed where Re5, Fa#5, La5, Fa#5 and Re3, La2 stand in plain clefs: on the staves, not far off on ledger lines.
    const plain = (number: number, staff: 'treble' | 'bass') => chordsIn(number, staff).map((c) => c.notes[0].step);
    expect(plain(24, 'treble')).toEqual([2, 0, -2, 0]);
    expect(plain(24, 'bass')).toEqual([4, 7]);
    // One ledger line in all (La5, just over the staff); as they sound, every note would need two or more.
    expect([...chordsIn(24), ...chordsIn(24, 'bass')].flatMap((c) => c.ledgerSteps)).toEqual([-2]);
  });

  it('prints the second part of bar 25 small, under a full-size melody, and plays both', () => {
    const chords = chordsIn(25);
    const melody = chords.filter((c) => !c.small);
    const second = chords.filter((c) => c.small);
    expect(melody.map((c) => [c.duration.value, c.stemUp])).toEqual(Array(4).fill(['quarter', true]));
    expect(second.map((c) => [c.duration.value, c.duration.dots, c.stemUp, c.notes.length])).toEqual([
      ['eighth', 0, false, 1],
      ['eighth', 0, false, 1],
      ['quarter', 1, false, 1],
      ['eighth', 0, false, 1],
      ['quarter', 0, false, 2],
    ]);
    // The small eighths have a beam of their own, and the small sharp is there.
    const beam = layout.beams[second[0].beam ?? -1];
    expect(beam.chords.map((i) => layout.chords[i].small)).toEqual([true, true]);
    expect(second[3].notes[0].accidental).toBe('sharp');
    // Nothing else in the piece is small.
    expect(layout.chords.filter((c) => c.small)).toHaveLength(5);

    // Both parts sound, the small one no softer for being small.
    const start = score.barBeats[score.barWritten.indexOf(25)];
    const inBar = score.notes.filter((n) => n.hand === 'right' && n.beat >= start - 1e-6 && n.beat < start + 4 - 1e-6);
    expect(inBar).toHaveLength(4 + 6);
    expect(new Set(inBar.map((n) => n.velocity)).size).toBe(1);
  });

  it('prints the words over the bars: what each bar shows, and the tempo in bold with its metronome mark', () => {
    const words = score.notation.words;
    expect(words.map((w) => w.text)).toEqual(expect.arrayContaining(['Beams', 'Voices', 'Shared notes', 'Clefs with an 8', 'Small notes', 'Repeats']));
    // Words that set a tempo are a tempo; the others are not.
    expect(words.filter((w) => w.tempo).map((w) => w.text)).toEqual(expect.arrayContaining(['Slower, piano']));
    expect(words.find((w) => w.text === 'Beams')?.tempo).toBe(false);
    // The words of dynamics, the left pedal and the jumps are not printed a second time.
    expect(words.filter((w) => /cresc|dim|corda|corde|coda|fine|d\.s\./i.test(w.text))).toEqual([]);
    expect(words.every((w) => !w.below)).toBe(true);
  });

  it('slows down through bar 27 at "rit.", and is back in tempo at "a tempo" in bar 28', () => {
    expect(score.notation.words.filter((w) => /rit|a tempo/.test(w.text)).map((w) => [w.text, w.beat])).toEqual([
      ['rit.', score.notation.bars[27].start],
      ['a tempo', score.notation.bars[28].start],
    ]);
    const start = score.barBeats[score.barWritten.indexOf(27)];
    const eighths = score.notes.filter((n) => n.hand === 'right' && n.beat >= start - 1e-6 && n.beat < start + 4 - 1e-6);
    const gaps = eighths.slice(1).map((n, i) => n.start - eighths[i].start);
    // Each eighth longer than the one before, the first hardly, the last by about a sixth.
    expect(gaps.every((gap, i) => i === 0 || gap > gaps[i - 1])).toBe(true);
    const inTempo = 60 / 90 / 2;
    expect(gaps[0] / inTempo).toBeLessThan(1.05);
    expect(gaps.at(-1)! / inTempo).toBeGreaterThan(1.1);
    expect(gaps.at(-1)! / inTempo).toBeLessThan(1.18);
    // Bar 28, first time round: quarters at 90 a minute again.
    const next = score.barBeats[score.barWritten.indexOf(28)];
    const quarters = score.notes.filter((n) => n.hand === 'right' && n.beat >= next - 1e-6 && n.beat < next + 4 - 1e-6);
    expect(quarters[1].start - quarters[0].start).toBeCloseTo(60 / 90);
  });

  it('prints the fingering of bar 26 over the right hand and under the left, and one note in brackets', () => {
    const inBar = layout.fingerings.filter((f) => barNumber(score, layout.chords[f.chord].bar) === 26);
    const of = (staff: 'treble' | 'bass') => inBar.filter((f) => layout.chords[f.chord].staff === staff).sort((a, b) => layout.chords[a.chord].beat - layout.chords[b.chord].beat || b.step - a.step);
    expect(of('treble').map((f) => [f.text, f.above])).toEqual([
      ['1', true],
      ['3', true],
      ['2', true],
      ['5', true],
      ['2-1', true],
    ]);
    expect(of('bass').map((f) => [f.text, f.above])).toEqual([
      ['5', false],
      ['2', false],
      ['3', false],
    ]);
    // Over the staff and over the notes; the chord's two fingers one over the other, the upper note's on top.
    const [, , lower, upper] = of('treble');
    expect(of('treble').every((f) => f.step <= -2 && f.step < layout.chords[f.chord].notes[0].step)).toBe(true);
    expect(upper.step).toBeLessThan(lower.step);
    expect(of('bass').every((f) => f.step >= 10)).toBe(true);
    // Nothing else in the piece is fingered or in brackets.
    expect(layout.fingerings).toHaveLength(8);
    const bracketed = layout.chords.filter((c) => c.notes.some((n) => n.parenthesized));
    expect(bracketed.map((c) => barNumber(score, c.bar))).toEqual([26]);
    // The note in brackets is played like the others.
    const start = score.barBeats[score.barWritten.indexOf(26)];
    expect(score.notes.filter((n) => n.hand === 'right' && n.beat >= start - 1e-6 && n.beat < start + 4 - 1e-6)).toHaveLength(5);
  });

  it('plays repeats, voltas, D.S. and the coda in order, while the page keeps each bar once', () => {
    // Printed bars are played in this order from bar 28 on (the pickup is bar 0, so index = number).
    const tail = score.barWritten.slice(score.barWritten.indexOf(28));
    expect(tail).toEqual([28, 29, 28, 30, 31, 28, 30, 32]);
    expect(score.notation.bars).toHaveLength(33);
    expect(score.notation.bars[28].navigation).toMatchObject({ repeatStart: true, segno: true, segnoSign: true });
    expect(score.notation.bars[29].navigation).toMatchObject({ ending: [1], endingLabel: '1.', repeatEnd: { times: 2 } });
    expect(score.notation.bars[30].navigation).toMatchObject({ ending: [2], toCoda: true, text: 'To Coda' });
    expect(score.notation.bars[31].navigation).toMatchObject({ jump: 'dalsegno', text: 'D.S. al Coda' });
    expect(score.notation.bars[32].navigation).toMatchObject({ coda: true, codaSign: true });
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
