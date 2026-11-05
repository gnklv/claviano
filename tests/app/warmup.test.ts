// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { button, onPiece, playback, settled, warmup, useApp } from './harness';

useApp();

it('leaves the session on returning to the library and resumes the same task paused', async () => {
  warmup.start('beginner', 5);
  await settled();
  expect(onPiece()).toBe(true);
  warmup.next();
  playback.seek(1);
  await playback.play();
  await settled();
  button(/Back to the library/).click();
  await settled();
  expect(onPiece()).toBe(false);
  expect(warmup.status).toBe('away');
  expect(playback.playing).toBe(false);
  warmup.resume();
  await settled();
  expect(onPiece()).toBe(true);
  expect(warmup.current).toBe(1);
  expect(playback.position).toBe(1);
  expect(playback.playing).toBe(false);
});

it('resumes the exercise on browser Forward so Next and another departure keep working', async () => {
  warmup.start('beginner', 5);
  await settled();
  playback.seek(1);
  button(/Back to the library/).click();
  await settled();
  expect(warmup.status).toBe('away');
  location.hash = '#/piece';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(warmup.status).toBe('active');
  playback.seek(2);
  button(/Back to the library/).click();
  await settled();
  warmup.resume();
  await settled();
  expect(playback.position).toBe(2);
  warmup.next();
  expect(warmup.current).toBe(1);
});

it('opens the library piece named by an address without resuming the warmup instead', async () => {
  warmup.start('beginner', 5);
  await settled();
  button(/Back to the library/).click();
  await settled();
  location.hash = '#/piece/demo.ode';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(playback.score?.title).toBe('Ode to Joy');
  expect(warmup.status).toBe('away');
});
