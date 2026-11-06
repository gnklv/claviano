/** Local-only report; the source scores and generated note lists must not be redistributed. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(process.argv[2] ?? join(root, 'samples'));
const output = resolve(process.argv[3] ?? join(root, '.layers'));
const window = new Window();
const before = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: window.DOMParser });
let server;
try {
  // Use the app's parsers and domain modules with the same TS resolution as the tests.
  // No dev server is started and the user's running player is not involved.
  server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  const { inspectLayerSamples } = await server.ssrLoadModule('/scripts/layerSamples.ts');
  const report = await inspectLayerSamples(input);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = ['# Written layer candidates', '',
    'Experimental selections of original written notes, not verified melodies or playable arrangements.',
    'Bars in headings use printed numbers. Diagnostic bars and JSON note.bar are zero-based written indices.',
    'Layer indices refer to each file’s notes table in report.json. Plain variants omit grace notes and ornament signs; tremolos and rolled chords remain.',
    'Projected event counts include all repeated occurrences; original timing, pedals and note objects are checked.',
    'Diagnostics are review cues, not measured musical accuracy. MIDI hands and voices are inferred.', ''];
  for (const file of report.files) {
    lines.push(`## ${file.file}`, '');
    if (file.status === 'error') {
      lines.push(`ERROR: ${file.error}`, '');
      console.log(`ERROR ${file.file}: ${file.error}`);
      continue;
    }
    lines.push(`${file.title} — ${file.source} voices, ${file.notes.length} written notes, ${file.graceNotes} grace notes.`, '');
    for (const part of file.parts) {
      const { lead, layers, voices, diagnostics } = part.candidates;
      const voice = (ref) => `staff ${ref.staff} / voice ${ref.voice}`;
      let previous = 0;
      const sizes = layers.map((layer) => {
        const label = `${layer.kind}: ${layer.notes.length} (+${layer.notes.length - previous})`;
        previous = layer.notes.length;
        return label;
      }).join(' → ');
      lines.push(`- Bars ${part.bars.join('–')}: ${lead ? voice(lead) : 'no lead'}; ${sizes || 'no ordinary notes'}.`);
      lines.push(`  Sound events (all occurrences): ${part.previews.map((preview) => `${preview.kind}: ${preview.events}, grace events ${preview.graces}${preview.plainEvents === undefined ? '' : `; plain ${preview.plainEvents}, grace events ${preview.plainGraces}`}`).join('; ')}.`);
      if (voices.length > 1) lines.push(`  Available voices: ${voices.map(voice).join('; ')}.`);
      for (const diagnostic of diagnostics) lines.push(`  Review: ${diagnostic.kind} (written indices ${diagnostic.bars.join(', ')}).`);
      for (const violation of part.violations) lines.push(`  FAILURE: ${violation}.`);
    }
    lines.push('');
    const flagged = file.parts.filter((part) => part.candidates.diagnostics.length).length;
    console.log(`${file.file}: ${file.parts.length} fragments, ${flagged} with review cues (${file.source})`);
  }
  const { parsed, files, failed, fragments, violations } = report.summary;
  const summary = `${parsed}/${files} files analysed; ${fragments} fragments; ${failed} errors; ${violations} structural violations.`;
  lines.push(summary, '');
  await writeFile(join(output, 'report.md'), lines.join('\n'));
  console.log(`\n${summary}\nReport: ${join(output, 'report.md')}\nData: ${join(output, 'report.json')}`);
  if (failed || violations) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  await window.happyDOM.close();
  if (before) Object.defineProperty(globalThis, 'DOMParser', before);
  else delete globalThis.DOMParser;
}
