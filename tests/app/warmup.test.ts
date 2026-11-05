// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { EXERCISES } from '../../src/domain/exercises/catalog';
import { exerciseScore } from '../../src/domain/exercises/score';
import { useI18n } from '../../src/ui/i18n/useI18n';
import { button, onPiece, playback, root, text, settled, warmup, useApp, drop, xml } from './harness';

useApp();

it('previews a chosen level and duration before opening the same queue paused', async () => {
  button(/^Warm-ups and exercises/).click();
  await settled();
  expect(location.hash).toBe('#/warmup');
  expect(warmup.status).toBe('idle');
  button(/^Intermediate$/).click();
  button(/^About 10 minutes$/).click();
  await settled();
  expect(text()).toContain('One-octave scale');
  const preview = [...root.querySelectorAll('ol li')].map(row => row.textContent);
  expect(preview.length).toBeGreaterThan(1);
  button(/^Open warm-up$/).click();
  await settled();
  expect(onPiece()).toBe(true);
  expect(warmup.selection).toEqual({ mode: 'warmup', level: 'intermediate', minutes: 10 });
  expect(warmup.steps).toHaveLength(preview.length);
  expect(playback.playing).toBe(false);
  expect(root.querySelector('.progress')?.getAttribute('aria-label')).toContain('1 of');
  button(/^Next exercise$/).click();
  await settled();
  expect(warmup.current).toBe(1);
  expect(playback.playing).toBe(false);
});

it('finishes explicitly, offers a fresh repeat, and sends Forward after finishing to completion', async () => {
  warmup.startExercise('five-notes', 'right');
  await settled();
  expect(button(/^Next exercise$/)).toBeUndefined();
  button(/^Finish/).click();
  await settled();
  expect(warmup.status).toBe('finished');
  expect(location.hash).toBe('#/warmup');
  expect(onPiece()).toBe(false);
  button(/^Repeat/).click();
  await settled();
  expect(warmup.status).toBe('active');
  expect(playback.position).toBe(0);
  expect(playback.playing).toBe(false);
  button(/^Finish/).click();
  await settled();
  button(/^Back to library$/).click();
  await settled();
  location.hash = '#/piece';
  window.dispatchEvent(new Event('hashchange'));
  await settled();
  expect(location.hash).toBe('#/warmup');
  expect(onPiece()).toBe(false);
});

it.each(EXERCISES)('opens the actual $id exercise with the selected hand', async exercise => {
  button(/^Warm-ups and exercises/).click();
  await settled();
  button(/^One exercise$/).click();
  button(new RegExp(`^${exercise.level.charAt(0).toUpperCase()}${exercise.level.slice(1)}$`)).click();
  await settled();
  const choice = [...root.querySelectorAll<HTMLButtonElement>('.catalog button')].find(item => item.textContent?.trim() === exercise.title)!;
  choice.click();
  await settled();
  button(/^Left$/).click();
  await settled();
  expect(text()).not.toContain('About 5 minutes');
  button(/^Open exercise$/).click();
  await settled();
  expect(warmup.selection).toEqual({ mode: 'exercise', exerciseId: exercise.id, hands: 'left' });
  expect(playback.score?.notes).toEqual(exerciseScore(exercise.id, 'left').notes);
  expect(playback.playing).toBe(false);
  expect(button(/^Next exercise$/)).toBeUndefined();
  expect(root.querySelector('.progress')).toBeNull();
});

it('replaces unavailable hand and exercise choices when changing level', async () => {
  button(/^Warm-ups and exercises/).click();
  await settled();
  button(/^One exercise$/).click();
  button(/^Intermediate$/).click();
  await settled();
  button(/^Both hands$/).click();
  button(/^Beginner$/).click();
  await settled();
  expect(button(/^Both hands$/)).toBeUndefined();
  button(/^Open exercise$/).click();
  await settled();
  expect(warmup.selection).toEqual({ mode: 'exercise', exerciseId: 'five-notes', hands: 'right' });
});

it('offers a separate return while Continue still opens the library piece', async () => {
  await drop('piece.musicxml', xml('My piece'));
  playback.seek(1);
  button(/Back to the library/).click();
  await settled();
  button(/^Warm-ups and exercises/).click();
  await settled();
  button(/^Open warm-up$/).click();
  await settled();
  playback.seek(2);
  button(/Back to the library/).click();
  await settled();
  expect(button(/^Continue/).textContent).toContain('My piece');
  button(/^Continue/).click();
  await settled();
  expect(playback.score?.title).toBe('My piece');
  expect(playback.position).toBe(1);
  button(/Back to the library/).click();
  await settled();
  button(/^Return to session$/).click();
  await settled();
  expect(warmup.status).toBe('active');
  expect(playback.position).toBe(2);
});

it('localizes the task header and the full sequence when changing language', async () => {
  warmup.start('beginner', 5);
  await settled();
  useI18n().locale.value = 'ru';
  await settled();
  expect(root.querySelector('.piece header')?.textContent).toContain('Пять нот');
  const openList = root.querySelector<HTMLButtonElement>('.warmup-task button[aria-haspopup="dialog"]')!;
  openList.click();
  await settled();
  expect(root.querySelector('dialog[open] [aria-current="step"]')?.textContent).toContain('Пять нот');
});

it('opens a new preparation from the library after finishing a previous session', async () => {
  warmup.startExercise('five-notes', 'right');
  await settled();
  button(/^Finish exercise$/).click();
  await settled();
  button(/^Back to library$/).click();
  await settled();
  button(/^Warm-ups and exercises$/).click();
  await settled();
  expect(button(/^Open warm-up$/)).toBeDefined();
  expect(button(/^Repeat exercise$/)).toBeUndefined();
});

it('finishes early from the sequence, closes the dialog, and can choose a different session', async () => {
  warmup.start('beginner', 5);
  await settled();
  root.querySelector<HTMLButtonElement>('.task-name')!.click();
  await settled();
  expect(root.querySelector('dialog[open]')).not.toBeNull();
  button(/^Finish early$/).click();
  await settled();
  expect(root.querySelector('dialog[open]')).toBeNull();
  expect(warmup.status).toBe('finished');
  button(/^Choose another session$/).click();
  await settled();
  button(/^Advanced$/).click();
  button(/^About 15 minutes$/).click();
  await settled();
  expect(text()).toContain('Repeated notes');
  expect(text()).not.toContain('Five notes');
  button(/^Open warm-up$/).click();
  await settled();
  expect(warmup.selection).toEqual({ mode: 'warmup', level: 'advanced', minutes: 15 });
  expect(warmup.current).toBe(0);
  expect(warmup.steps.some(step => step.exerciseId === 'leaps' || step.exerciseId === 'octaves')).toBe(false);
});

it('shows the single exercise details without a queue or a warm-up time estimate', async () => {
  warmup.startExercise('scale-two-octaves', 'both');
  await settled();
  root.querySelector<HTMLButtonElement>('.task-name')!.click();
  await settled();
  const dialog = root.querySelector('dialog[open]')!;
  expect(dialog.getAttribute('aria-label')).toBe('About this exercise');
  expect(dialog.querySelector('h2')?.textContent).toBe('Two-octave scale');
  expect(dialog.textContent).toContain('Keep the fingering consistent');
  expect(dialog.querySelector('ol')).toBeNull();
  expect(dialog.textContent).not.toContain('Time estimates');
});

it('changes repetitions, not difficulty, when changing the available time', async () => {
  button(/^Warm-ups and exercises/).click();
  await settled();
  const titles = () => [...root.querySelectorAll('ol li strong')].map(row => row.textContent);
  const before = titles();
  const repetitions = text();
  button(/^About 15 minutes$/).click();
  await settled();
  expect(titles()).toEqual(before);
  expect(text()).not.toBe(repetitions);
  expect(warmup.status).toBe('idle');
});

it('does not let a slow file read replace a warm-up opened from preparation', async () => {
  let resolve!: (bytes: ArrayBuffer) => void;
  const bytes = new Promise<ArrayBuffer>(done => { resolve = done; });
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: { files: [{ name: 'slow.musicxml', arrayBuffer: () => bytes }] } });
  root.querySelector('.app')!.dispatchEvent(event);
  button(/^Warm-ups and exercises/).click();
  await settled();
  button(/^Open warm-up$/).click();
  await settled();
  const score = playback.score;
  resolve(new TextEncoder().encode(xml('Slow piece')).buffer);
  await settled();
  expect(playback.score).toBe(score);
  expect(warmup.status).toBe('active');
});

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
