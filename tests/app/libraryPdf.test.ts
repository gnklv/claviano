// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { drop, onPiece, playback, root, useApp } from './harness';

useApp();

const showcase = readFileSync('tests/fixtures/pdf/showcase.pdf');

it('opens a complete PDF from the library and plays the written repeats', async () => {
  await drop('Study.PDF', Uint8Array.from(showcase).buffer);
  expect(onPiece()).toBe(true);
  expect(playback.score?.title).toBe('Study');
  expect(playback.score?.notation?.bars).toHaveLength(36);
  expect(playback.score!.barWritten.length).toBeGreaterThan(36);
});

it('reports the page where recognition stops and keeps the current piece', async () => {
  await drop('Study.pdf', Uint8Array.from(showcase).buffer);
  const current = playback.score;
  // Leave page two blank, keeping the cross-reference offsets and the page tree intact.
  const blankLastPage = Buffer.from(showcase);
  const lastContents = blankLastPage.lastIndexOf('/Contents ');
  expect(lastContents).toBeGreaterThan(blankLastPage.indexOf('/Contents '));
  blankLastPage.write('/Ignored ', lastContents, 'ascii');
  await drop('Incomplete.pdf', Uint8Array.from(blankLastPage).buffer);
  expect(playback.score).toBe(current);
  expect(root.querySelector('[role=alert]')?.textContent).toMatch(/Incomplete.pdf.*page 2/);
});
