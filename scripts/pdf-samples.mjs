// Compare a PDF reading with its independently parsed reference. Always include the public showcase and add any local samples.
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { compareCzardasPrint, czardasPlaybackTiming } from './czardas-pdf-comparison.mjs';
import { expectedShowcaseBar, inspectShowcaseBar } from './showcase-pdf-bars.mjs';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(process.argv[2] ?? join(root, 'samples'));
const output = resolve(process.argv[3] ?? join(root, '.pdf-samples'));
const window = new Window();
globalThis.DOMParser = window.DOMParser;

// Voice IDs are local to an engraving. Compare the notes grouped in each voice on its staff.
function writtenVoices(notes) {
  const voices = new Map();
  for (const { voice, ...note } of notes) {
    const id = note.staff + '/' + voice;
    if (!voices.has(id)) voices.set(id, []);
    voices.get(id).push(note);
  }
  return [...voices.values()].map(group => group.sort((a, b) => a.beat - b.beat));
}

// Report the actual written objects, so a discrepancy can be located in the exported score.
function difference(expected, actual) {
  const key = value => JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const remaining = expected.map(value => ({ key: key(value), value }));
  const extra = [];
  for (const value of actual) {
    const id = key(value);
    const index = remaining.findIndex(item => item.key === id);
    if (index < 0) extra.push(value);
    else remaining.splice(index, 1);
  }
  return { missing: remaining.map(item => item.value), extra };
}

// Check the finger assigned to each key independently of its printed side.
function compareFingerings(reference, pdf, barCount, engrave) {
  const marks = notes => notes.filter(n => n.bar < barCount && n.fingering).map(n => ({
    measure: n.bar + 1, staff: n.staff, beat: n.beat, sounding: n.sounding,
    text: n.fingering.text, below: n.fingering.below,
  }));
  const expected = marks(reference.notation.notes), actual = marks(pdf.notation.notes);
  if (!expected.length && !actual.length) return undefined;
  const assignment = ({ below, ...mark }) => mark;
  const drawn = score => engrave(score).fingerings.flatMap(finger => {
    const note = score.notation.notes[finger.writtenIndex];
    return note && note.bar < barCount ? [{ measure: note.bar + 1, staff: note.staff,
      beat: note.beat, sounding: note.sounding, text: finger.text, below: !finger.above }] : [];
  });
  return {
    referenceMarks: expected.length, pdfMarks: actual.length,
    unspecifiedReferenceSides: expected.filter(mark => mark.below === null).length,
    assignments: difference(expected.map(assignment), actual.map(assignment)),
    placements: difference(expected, actual),
    engraved: difference(drawn(reference), drawn(pdf)),
  };
}

// A changed mark makes the entire voice differ. Break down unambiguous
// note pairs for diagnosis while retaining the complete strict comparison.
function noteFieldDifferences(voices) {
  const byPosition = groups => {
    const positions = new Map();
    for (const note of groups.flat()) {
      const position = [note.bar, note.staff, note.beat, note.sounding, note.beats].join('/');
      // A unison can occur in two voices. Its field differences cannot be
      // assigned to a particular head from the position alone.
      positions.set(position, positions.has(position) ? null : note);
    }
    return positions;
  };
  const actual = byPosition(voices.extra);
  const fields = {};
  for (const [position, expected] of byPosition(voices.missing)) {
    const note = actual.get(position);
    if (!expected || !note) continue;
    for (const field of new Set([...Object.keys(expected), ...Object.keys(note)])) {
      if (isDeepStrictEqual(expected[field], note[field])) continue;
      const entry = fields[field] ??= { count: 0, first: {
        measure: expected.bar + 1, staff: expected.staff, beat: expected.beat, sounding: expected.sounding,
        reference: expected[field] ?? null, pdf: note[field] ?? null,
      } };
      entry.count++;
    }
  }
  return fields;
}

// A different inferred side can make one phrase look like two distinct
// missing/extra arcs. Keep the strict result and pair these by endpoints.
function slurDifferences(diff, notes) {
  const extra = [...diff.extra], missing = [], placement = [];
  for (const expected of diff.missing) {
    const index = extra.findIndex(mark => mark.staff === expected.staff && mark.start === expected.start
      && mark.end === expected.end && mark.above !== expected.above);
    if (index < 0) {
      missing.push(expected);
      continue;
    }
    const [actual] = extra.splice(index, 1);
    // When multiple slurs open on this chord, only claim a default side if
    // every opening leaves it unspecified.
    const openings = notes.filter(n => (n.staff >= 2 ? 'bass' : 'treble') === expected.staff && n.beat === expected.start)
      .flatMap(n => n.slurs.filter(m => m.type === 'start'));
    placement.push({ ...expected, pdfAbove: actual.above,
      inferredReferenceSide: openings.length > 0 && openings.every(m => m.placement == null) });
  }
  return { placement, missing, extra };
}

// Match only a complete missing bracket at the diagnosed endpoints. Any unexpected
// preview pedal, unrelated mark, or playback event remains a strict difference.
function explainPedalIssue(issue, differences) {
  if (issue.kind !== 'ambiguous-pedal' || issue.staff !== 2) return issue;
  const marks = differences.pedalMarks?.missing ?? [];
  const moves = differences.pedalMoves?.missing ?? [];
  const starts = marks.filter(mark => mark.line && mark.pedal !== 'soft' && mark.type === 'start' && mark.beat === issue.start);
  if (starts.length !== 1) return issue;
  const [start] = starts;
  const stops = marks.filter(mark => mark.line && mark.pedal === start.pedal && mark.type === 'stop' && mark.beat === issue.end);
  const presses = moves.filter(move => move.pedal === start.pedal && move.bar === issue.bar && move.down && move.beat === issue.start);
  const releases = moves.filter(move => move.pedal === start.pedal && move.bar === issue.bar && !move.down && move.beat === issue.end);
  if (stops.length !== 1 || presses.length !== 1 || releases.length !== 1) return issue;
  const referenceDifferences = { pedalMarks: [start, ...stops], pedalMoves: [...presses, ...releases] };
  for (const [field, explained] of Object.entries(referenceDifferences)) {
    const diff = differences[field];
    diff.missing = diff.missing.filter(value => !explained.includes(value));
    if (!diff.missing.length && !diff.extra.length) delete differences[field];
  }
  return { ...issue, referenceDifferences };
}

function writtenFragment(score, count, engrave, inferredStems = new Map()) {
  const notation = score.notation;
  const bars = notation.bars.slice(0, count);
  const last = bars.at(-1);
  const end = last ? last.start + last.length : 0;
  const notes = notation.notes.filter(note => note.bar < count);
  // MusicXML may leave slur placement to the engraver. Compare the resolved side while
  // retaining the written endpoint and number on each note.
  const slurs = [];
  if (notes.some(note => note.slurs.length)) {
    const layout = engrave(score);
    for (const { from, to, above } of layout.slurs) {
      const start = layout.chords[from];
      const stop = layout.chords[to];
      if (start.bar < count && stop.bar < count) slurs.push({ staff: start.staff, start: start.beat, end: stop.beat, above });
    }
  }
  const beforeEnd = marks => marks.filter(mark => mark.beat < end);
  return {
    bars, slurs, voices: writtenVoices(notes.map(note => ({
      ...note, stem: note.stem ?? inferredStems.get(note) ?? null, slurs: note.slurs.map(({ type, number }) => ({ type, number })),
    }))), clefs: beforeEnd(notation.clefs),
    timeSignatures: beforeEnd(notation.timeSignatures), keySignatures: beforeEnd(notation.keySignatures),
    tempoMarks: beforeEnd(notation.tempoMarks), words: beforeEnd(notation.words),
    // A separate playback velocity may accompany the printed dynamic in the reference.
    dynamics: beforeEnd(notation.dynamics).map(({ beat, below, text, letters }) => ({ beat, below, text, letters })),
    pedalMarks: notation.pedalMarks.filter(mark => mark.beat < end || (mark.beat === end && mark.type === 'stop')),
    rests: beforeEnd(notation.rests), graces: notation.graces.filter(group => group.bar < count),
    hairpins: notation.hairpins.filter(mark => mark.start < end),
    octaveShifts: notation.octaveShifts.filter(mark => mark.start < end),
  };
}

// The performance score merges printed metronome marks with playback tempos.
// Read the source notation before that merge to retain its provenance.
async function sourceDirections(path, parser, end) {
  const data = Uint8Array.from(await readFile(path)).buffer;
  const part = parser.readNotation(data, basename(path));
  const beforeEnd = marks => marks.filter(mark => mark.beat < end);
  return {
    printedTempo: beforeEnd(part.tempoMarks).filter(mark => mark.printed),
    playbackTempo: beforeEnd(part.tempoMarks).filter(mark => !mark.printed),
    playbackDynamics: beforeEnd(part.dynamicLevels),
  };
}

// Compare audible attacks after repeats, ties, graces, arpeggios and tremolos.
// Horizontal positions and expressive velocity are separate from played pitch and rhythm.
function playbackComparison(reference, actual, timingExceptions) {
  const sorted = score => score.notes.map(({ beat, beats, hand, pitch }) => ({ beat, beats, hand, pitch }))
    .sort((a, b) => a.beat - b.beat || a.pitch - b.pitch || a.hand.localeCompare(b.hand) || a.beats - b.beats);
  const expected = sorted(reference), played = sorted(actual);
  // A missing attack shifts array indices for the remainder of a piece.
  // Count identical musical events independently of their position in that array.
  const eventKey = n => [n.hand, n.pitch, n.beat.toFixed(8), n.beats.toFixed(8)].join('/');
  const remaining = new Map();
  for (const n of expected) {
    const key = eventKey(n);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let matchedAttacks = 0;
  for (const n of played) {
    const key = eventKey(n), count = remaining.get(key);
    if (count) {
      matchedAttacks++;
      remaining.set(key, count - 1);
    }
  }
  let differingAttacks = 0, pitchOrHandDifferences = 0;
  let maxOnsetErrorBeats = 0, maxDurationErrorBeats = 0;
  const explainedTimingDifferences = [];
  const unexplained = [];
  const sameAttack = (a, b) => a.pitch === b.pitch && a.hand === b.hand
    && Math.abs(a.beat - b.beat) <= 1e-8 && Math.abs(a.beats - b.beats) <= 1e-8;
  for (let i = 0; i < Math.max(expected.length, played.length); i++) {
    const a = expected[i], b = played[i];
    if (!a || !b || a.pitch !== b.pitch || a.hand !== b.hand) {
      differingAttacks++;
      pitchOrHandDifferences++;
      unexplained.push({ source: a ?? null, preview: b ?? null });
      continue;
    }
    const onset = Math.abs(a.beat - b.beat), duration = Math.abs(a.beats - b.beats);
    if (onset > 1e-8 || duration > 1e-8) {
      differingAttacks++;
      const exception = timingExceptions.find(entry => !explainedTimingDifferences.includes(entry)
        && sameAttack(a, entry.source) && sameAttack(b, entry.printed));
      if (exception) explainedTimingDifferences.push(exception);
      else unexplained.push({ source: a, preview: b });
    }
    maxOnsetErrorBeats = Math.max(maxOnsetErrorBeats, onset);
    maxDurationErrorBeats = Math.max(maxDurationErrorBeats, duration);
  }
  return { expectedAttacks: expected.length, actualAttacks: played.length, matchedAttacks, differingAttacks, pitchOrHandDifferences,
    maxOnsetErrorBeats, maxDurationErrorBeats, explainedTimingDifferences, unexplained };
}

async function readScore(parser, path, name) {
  const bytes = await readFile(path);
  return parser.parse(Uint8Array.from(bytes).buffer, name);
}

let server;
try {
  const files = await readdir(input).catch(error => {
    if (error.code === 'ENOENT' && !process.argv[2]) return [];
    throw error;
  });
  const showcase = { file: 'showcase.pdf', path: join(root, 'tests/fixtures/pdf/showcase.pdf'),
    reference: join(root, 'public/demos/showcase.musicxml'), source: 'public' };
  const pdfs = files.filter(file => /\.pdf$/i.test(file) && join(input, file) !== showcase.path).sort();
  const samples = [showcase, ...pdfs.map(file => {
    const name = basename(file, extname(file));
    const reference = files.find(f => basename(f, extname(f)) === name && /\.(mxl|musicxml|xml)$/i.test(f));
    return { file, path: join(input, file), reference: reference && join(input, reference), source: 'local' };
  })];
  await mkdir(output, { recursive: true });
  const run = await mkdtemp(join(output, 'run-'));
  server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } });
  const load = path => server.ssrLoadModule('/src/' + path);
  const [{ readPdf }, { extractPdfGeometry }, { readPianoDocumentPreview }, { pianoStaffPairs, strips, timeOf }, { roundDotCenter }, { MusicXmlParser },
    { writePdfPreviewMusicXml }, { engrave }] =
    await Promise.all([load('infrastructure/parsers/pdf/document.ts'), load('infrastructure/parsers/pdf/geometry.ts'),
      load('infrastructure/parsers/pdf/pianoPreview.ts'), load('infrastructure/parsers/pdf/pianoGeometry.ts'),
      load('infrastructure/parsers/pdf/curves.ts'),
      load('infrastructure/parsers/MusicXmlParser.ts'), load('infrastructure/writers/pdfPreviewMusicXml.ts'),
      load('domain/notation/engraving/index.ts')]);
  const reports = [];
  for (const sample of samples) {
    const { file, reference, source } = sample;
    const name = basename(file, extname(file));
    const report = { file, source, pages: [] };
    reports.push(report);
    try {
      const doc = readPdf(await readFile(sample.path));
      const showcaseText = [];
      const glyphCounts = new Map();
      const closingBars = [];
      let writtenBar = 0;
      for (let i = 0; i < doc.pageCount; i++) {
        const geometry = extractPdfGeometry(doc.page(i));
        const page = { page: i + 1, glyphs: geometry.glyphs.length, segments: geometry.segments.length, fills: geometry.fills.length };
        if (sample === showcase) {
          showcaseText.push(geometry.glyphs.map(glyph => glyph.text).join('').replace(/\s/g, ''));
          const measures = pianoStaffPairs(geometry.segments);
          page.staffPairs = measures.length;
          for (const measure of measures) {
            if (writtenBar >= 33 && writtenBar <= 35) {
              closingBars.push({ bar: writtenBar, ...inspectShowcaseBar(geometry, measure, { roundDotCenter, strips, timeOf }) });
            }
            writtenBar++;
          }
          for (const { text } of geometry.glyphs) {
            const code = text.codePointAt(0);
            glyphCounts.set(code, (glyphCounts.get(code) ?? 0) + 1);
          }
        }
        report.pages.push(page);
      }
      const preview = readPianoDocumentPreview(doc, name);
      const notation = preview?.notation;
      if (preview?.issues.length) report.issues = preview.issues;
      const parser = new MusicXmlParser();
      const edition = reference && await readScore(parser, reference, name);
      if (edition) report.reference = { file: basename(reference), bars: edition.notation.bars.length,
        notes: edition.notation.notes.length };
      if (sample === showcase) {
        if (report.pages.reduce((sum, page) => sum + page.staffPairs, 0) !== edition.notation.bars.length) {
          throw Error('Showcase staff pairs differ from the reference bar count');
        }
        report.closingBars = closingBars;
        const expectedBars = [33, 34, 35].map(bar => expectedShowcaseBar(edition.notation, bar));
        const diff = difference(expectedBars, closingBars);
        if (diff.missing.length || diff.extra.length) {
          report.closingBarDifferences = diff;
          throw Error('The closing showcase bars differ from the printed MusicXML reference');
        }
        const notes = edition.notation.notes;
        const symbols = [
          ['double-sharp', 0xe263, notes.filter(note => note.accidental === 'double-sharp').length],
          ['double-flat', 0xe264, notes.filter(note => note.accidental === 'double-flat').length],
          ['tuplet-5', 0xe885, notes.filter(note => note.tupletStart?.showNumber && note.tuplet?.actual === 5).length],
        ];
        report.symbols = symbols.map(([name, code, expected]) => ({ name, expected, actual: glyphCounts.get(code) ?? 0 }));
        if (report.symbols.some(symbol => !symbol.expected || symbol.actual !== symbol.expected)) {
          throw Error('Showcase music symbol counts differ from the reference');
        }
        // Directions from the opening, middle and final systems independently identify the printed score.
        const anchors = ['Pickup', 'Tuplets', 'Grace notes', 'Repeats'];
        report.directions = anchors.map(text => ({
          text, beat: edition.notation.words.find(mark => mark.text === text)?.beat,
          page: showcaseText.findIndex(page => page.includes(text.replace(/\s/g, ''))) + 1,
        }));
        if (report.directions.some(mark => mark.beat === undefined || !mark.page)) {
          throw Error('Missing showcase directions in the PDF or reference');
        }
      }
      if (preview) report.coverage = { barsRead: notation.bars.length, referenceBars: edition?.notation.bars.length,
        partial: preview.coverage !== 'full', stoppedAtPage: preview.stoppedAtPage };
      if (!notation) {
        report.status = 'outside-preview-subset';
        if (sample === showcase) throw Error('Missing public showcase opening preview');
      } else {
        report.preview = (sample === showcase ? 'public-' : '') + name + '.preview.musicxml';
        const path = join(run, report.preview);
        await writeFile(path, writePdfPreviewMusicXml(notation));
        const reopened = await readScore(parser, path, name);
        report.bars = reopened.notation.bars.length;
        if (report.bars !== notation.bars.length) throw Error('Reopened preview has a different bar count');
        report.status = 'no-reference';
        if (edition) {
          if (!report.bars || !reopened.notation.notes.length) throw Error('Empty PDF preview');
          const inferredStems = new Map();
          if (sample === showcase) {
            // Compare the reference layout's default for each unspecified stem with the
            // explicit PDF reading. A missing or reversed PDF stem remains a mismatch.
            for (const chord of engrave(edition).chords.filter(chord => chord.bar < report.bars && !['whole', 'breve'].includes(chord.duration.value))) {
              for (const head of chord.notes) {
                const note = edition.notation.notes[head.writtenIndex];
                if (!note.stem) inferredStems.set(note, chord.stemUp ? 'up' : 'down');
              }
            }
            report.inferredReferenceStems = [...inferredStems].map(([{ bar, beat, staff, pitch }, stem]) =>
              ({ bar, beat, staff, pitch, stem }));
          }
          const expectedBarCount = report.coverage.partial ? notation.bars.length : edition.notation.bars.length;
          const expected = writtenFragment(edition, expectedBarCount, engrave, inferredStems);
          const actual = writtenFragment(reopened, reopened.notation.bars.length, engrave);
          expected.pedalMoves = edition.notation.pedalMoves.filter(move => move.bar < expectedBarCount);
          actual.pedalMoves = reopened.notation.pedalMoves;
          if (sample === showcase) {
            // Verovio prints the second ending as “2” and the final sustain bracket
            // without either pedal sign. Keep source and printed values in the report.
            const printedDifferences = [];
            expected.bars = expected.bars.map((bar, index) => {
              if (index !== 30 || bar.navigation.endingLabel !== '2.') return bar;
              printedDifferences.push({ bar: index, field: 'endingLabel', source: '2.', printed: '2' });
              return { ...bar, navigation: { ...bar.navigation, endingLabel: '2' } };
            });
            expected.pedalMarks = expected.pedalMarks.map(mark => {
              if (mark.pedal !== 'sustain' || !mark.line || !mark.sign
                || !(mark.beat === 122 && mark.type === 'start' || mark.beat === 126 && mark.type === 'stop')) return mark;
              printedDifferences.push({ bar: 32, field: 'pedalSign', beat: mark.beat, source: true, printed: false });
              return { ...mark, sign: false };
            });
            // The source leaves bar 26's fingerings unplaced. Verovio prints
            // every fingering above its head, including all three bass notes.
            report.inferredReferenceFingerings = [];
            expected.voices = expected.voices.map(voice => voice.map(note => {
              if (note.bar !== 26 || note.fingering?.below !== null) return note;
              const { bar, beat, staff, sounding, fingering } = note;
              report.inferredReferenceFingerings.push({ bar, beat, staff, sounding, text: fingering.text, source: null, printed: 'above' });
              return { ...note, fingering: { ...fingering, below: false } };
            }));
            report.printedDifferences = printedDifferences;
          }
          const last = expected.bars.at(-1);
          const end = last.start + last.length;
          const [referenceDirections, previewDirections] = await Promise.all(
            [reference, path].map(file => sourceDirections(file, parser, end)));
          report.playbackOnly = {
            tempo: difference(referenceDirections.playbackTempo, previewDirections.playbackTempo),
            dynamics: difference(referenceDirections.playbackDynamics, previewDirections.playbackDynamics),
          };
          if (sample === showcase) {
            expected.tempoMarks = referenceDirections.printedTempo;
            actual.tempoMarks = previewDirections.printedTempo;
          }
          const compareCzardas = file === 'czardas.pdf' && !report.coverage.partial;
          if (compareCzardas) compareCzardasPrint(expected, actual, report, edition);
          if (!report.coverage.partial) {
            const timingExceptions = compareCzardas && report.printedDifferences.some(mark => mark.field === 'tupletTiming')
              ? czardasPlaybackTiming(edition) : [];
            report.playback = playbackComparison(edition, reopened, timingExceptions);
            report.playbackOrder = reopened.barWritten;
            expected.playbackOrder = [edition.barWritten];
            actual.playbackOrder = [reopened.barWritten];
          }
          const differences = {};
          for (const field of Object.keys(expected)) {
            const diff = difference(expected[field], actual[field]);
            if (diff.missing.length || diff.extra.length) differences[field] = diff;
          }
          if (report.issues) report.issues = report.issues.map(issue => explainPedalIssue(issue, differences));
          report.comparison = { reference: basename(reference), expectedNotes: expected.voices.flat().length,
            actualNotes: reopened.notation.notes.length, differences };
          report.comparison.fingerings = compareFingerings(edition, reopened, expectedBarCount, engrave);
          if (differences.slurs) report.comparison.slurDifferences = slurDifferences(differences.slurs, edition.notation.notes);
          if (differences.voices) report.comparison.noteFieldDifferences = noteFieldDifferences(differences.voices);
          if (sample === showcase && (report.coverage.partial || report.bars !== 36
              || report.comparison.expectedNotes !== 263 || report.comparison.actualNotes !== 263)) {
            throw Error('Expected all 36 written bars and 263 principal notes of the showcase');
          }
          const matched = report.coverage?.partial ? 'matched-prefix' : 'matched';
          report.status = Object.keys(differences).length || report.playback?.unexplained.length ? 'different'
            : report.issues?.length ? matched + '-with-issues'
            : report.printedDifferences?.length ? matched + '-with-print-differences' : matched;
        }
      }
    } catch (error) {
      report.status = 'error';
      report.error = error.message;
    }
    const bars = report.coverage?.referenceBars === undefined ? report.coverage?.barsRead
      : `${report.coverage.barsRead}/${report.coverage.referenceBars}`;
    const coverage = report.coverage ? ` (${bars} bars${report.comparison ? `, ${report.comparison.actualNotes} notes` : ''})` : '';
    console.log(file, report.pages.length + ' pages:', report.status + coverage);
  }
  await writeFile(join(run, 'report.json'), JSON.stringify(reports, null, 2) + '\n');
  console.log('Report and previews:', run);
  const local = reports.filter(report => report.source === 'local');
  const complete = report => ['matched', 'matched-with-print-differences'].includes(report.status) && report.coverage?.partial === false;
  if (local.some(report => ['czardas.pdf', 'golden-hour-jvke-updated-ver.pdf'].includes(report.file) && !complete(report))
      || (local.length && !local.some(complete))
      || reports.some(report => ['error', 'different'].includes(report.status))) process.exitCode = 1;
} finally {
  await server?.close();
  await window.happyDOM.close();
}
