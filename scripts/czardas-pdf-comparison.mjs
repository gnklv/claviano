// This comparison describes the differences between the Czardas PDF engraving
// and its accompanying MuseScore export. The importer and preview are untouched.
const printedSlurs = [
  { measure: 55, starts: [142, 143] },
  { measure: 63, starts: [158, 159] },
  { measure: 83, starts: [198, 199] },
  { measure: 84, starts: [200, 201] },
];

const printedCrescendos = [
  { measure: 8, start: 20, end: 24, text: 'cresc.' },
  { measure: 34, start: 100, end: 102, text: 'cresc. molto' },
  { measure: 50, start: 132, end: 134, text: 'cresc.molto' },
  { measure: 112, start: 257, end: 258, text: 'cresc.' },
];

const septupletBar = 17;
const septupletStart = 62.25;
const rounded = 51 / 480;
const exact = 3 / 28;
const septupletPitches = [76, 77, 76, 75, 76, 77, 76];

// Playback revisits the printed passage. Each exception identifies one exact
// source attack and its exact printed timing, including the first note's duration.
export function czardasPlaybackTiming(edition) {
  return edition.barWritten.flatMap((bar, index) => {
    if (bar !== septupletBar) return [];
    const start = edition.barBeats[index] + (septupletStart - edition.notation.bars[bar].start);
    return septupletPitches.map((pitch, note) => ({
      measure: bar + 1,
      playedBar: index,
      source: { pitch, hand: 'right', beat: start + note * rounded, beats: rounded },
      printed: { pitch, hand: 'right', beat: start + note * exact, beats: exact },
    }));
  });
}

function withPrintedRhythm(voices, deviations) {
  return voices.map(voice => {
    const start = septupletStart;
    const group = voice.filter(note => note.bar === septupletBar && note.staff === 1
      && note.tuplet?.actual === 7 && note.tuplet.normal === 6);
    const septuplet = group.length === septupletPitches.length && group.every((note, index) =>
      note.sounding === septupletPitches[index] && note.beat === start + index * rounded && note.beats === rounded
      && note.duration.value === 'thirtySecond' && note.duration.dots === 0
      && note.tupletStop === (index === 6)
      && (index === 0 ? note.tupletStart?.showNumber === false && note.tupletStart.bracket === false
        : note.tupletStart === null));
    if (septuplet) {
      deviations.push({
        measure: 18, field: 'tupletTiming',
        source: { start, count: 7, noteLength: rounded },
        printed: { start, count: 7, noteLength: exact },
        evidence: 'Seven thirty-second heads share a beam and fill the remaining three quarters of the beat. The source gives the 7:6 ratio and rounds each duration to 51 of 480 ticks.',
      });
    }
    return voice.map(note => {
      if (note.bar === 13 && note.staff === 1 && note.beat === 46.375 && note.sounding === 77
        && note.beams.length === 3 && note.beams[0] === 'continue'
        && note.beams[1] === 'continue' && note.beams[2] === 'forward hook') {
        deviations.push({
          measure: 14, field: 'beamHook', beat: note.beat, staff: 1, pitch: note.sounding,
          source: 'forward hook', printed: 'backward hook',
          evidence: 'The third beam leaves the F5 stem to the left.',
        });
        return { ...note, beams: [note.beams[0], note.beams[1], 'backward hook'] };
      }
      const index = septuplet ? group.indexOf(note) : -1;
      return index < 0 ? note : { ...note, beat: start + index * exact, beats: exact };
    });
  });
}

function hasUnplacedEndpoint(notes, measure, beat, type) {
  const marks = notes.filter(note => note.bar === measure - 1 && note.staff === 1 && note.beat === beat)
    .flatMap(note => note.slurs).filter(mark => mark.type === type && mark.number === 1);
  return marks.length > 0 && marks.every(mark => mark.placement === null);
}

/** Mutates only the expected comparison fragment and adds the edition differences to the report. */
export function compareCzardasPrint(expected, _actual, report, edition) {
  const deviations = [];
  expected.voices = withPrintedRhythm(expected.voices, deviations);
  expected.slurs = expected.slurs.map(slur => {
    if (slur.staff !== 'treble' || slur.above !== false || slur.end !== slur.start + 0.5) return slur;
    const entry = printedSlurs.find(({ starts }) => starts.includes(slur.start));
    if (!entry || !hasUnplacedEndpoint(edition.notation.notes, entry.measure, slur.start, 'start')
      || !hasUnplacedEndpoint(edition.notation.notes, entry.measure, slur.end, 'stop')) return slur;
    const printed = { ...slur, above: true };
    deviations.push({
      measure: entry.measure, field: 'slurPlacement', source: { ...slur, placement: null }, printed,
      evidence: 'The source leaves both endpoints unplaced. The PDF draws the curve above the upper-staff heads.',
    });
    return printed;
  });
  expected.hairpins = expected.hairpins.filter(wedge => {
    if (wedge.type !== 'crescendo' || wedge.below || !wedge.drawn) return true;
    const entry = printedCrescendos.find(({ start, end }) => start === wedge.start && end === wedge.end);
    if (!entry) return true;
    const printed = { beat: entry.start, below: false, text: entry.text, letters: false };
    expected.dynamics = [...expected.dynamics, printed];
    deviations.push({
      measure: entry.measure, field: 'crescendo', source: wedge, printed,
      evidence: 'Italic crescendo words occupy this passage in the PDF in place of the source wedge.',
    });
    return false;
  });
  expected.words = expected.words.map(word => {
    if (word.text !== 'Piû presto' || word.beat !== 268.5 || word.tempo || word.below) return word;
    const printed = { ...word, beat: 268 };
    deviations.push({
      measure: 118, field: 'wordsAnchor', source: word, printed, ambiguous: true,
      evidence: 'The P begins 3.85 PDF points left of the first head and 18.38 points left of the second column. The PDF gives a visual alignment, while the intended rhythmic attachment is ambiguous.',
    });
    return printed;
  });
  report.printedDifferences = [...(report.printedDifferences ?? []), ...deviations];
}
