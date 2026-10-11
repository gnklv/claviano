// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { button, root, settled, useApp } from './harness';

/* Installing the app: the word about it in the settings. (By itself: once installed, it stays so for the page.) */

useApp();

describe('installing the app', () => {
const labels = () => [...root.querySelector('dialog')!.querySelectorAll('.label')].map((label) => label.textContent);

it('offers to install the app once the browser says it can be, asks the browser when pressed, and offers no more once installed', async () => {
  expect(labels()).not.toContain('App');
  let asked = 0;
  const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: () => Promise.resolve(void asked++) });
  window.dispatchEvent(offer);
  await settled();
  // (The browser's own banner is held back: the offer is the app's to make.)
  expect(offer.defaultPrevented).toBe(true);
  expect(labels()).toContain('App');

  button(/^Install$/).click();
  await settled();
  expect(asked).toBe(1);
  expect(labels()).not.toContain('App');

  window.dispatchEvent(offer);
  window.dispatchEvent(new Event('appinstalled'));
  await settled();
  expect(labels()).not.toContain('App');
});
});
