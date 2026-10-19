import { describe, expect, it } from 'vitest';
import { installWay } from '../src/ui/browser/installWay';

describe('how the app can be installed', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const here = { standalone: false, canPrompt: false, userAgent: MAC, touchPoints: 0 };

  it('is by asking the browser, where the browser has offered', () => {
    expect(installWay({ ...here, canPrompt: true, userAgent: ANDROID, touchPoints: 5 })).toBe('prompt');
    expect(installWay({ ...here, canPrompt: true })).toBe('prompt');
  });

  it('is by hand on an iPhone, and on an iPad (which says it is a Mac, but has a touch screen)', () => {
    expect(installWay({ ...here, userAgent: IPHONE, touchPoints: 5 })).toBe('ios');
    expect(installWay({ ...here, userAgent: MAC, touchPoints: 5 })).toBe('ios');
  });

  it('is not the page’s to offer elsewhere: a Mac’s Safari, Android before the browser offers', () => {
    expect(installWay(here)).toBe('none');
    expect(installWay({ ...here, userAgent: ANDROID, touchPoints: 5 })).toBe('none');
  });

  it('is done already in the installed app, whatever else', () => {
    expect(installWay({ ...here, standalone: true, canPrompt: true })).toBe('installed');
    expect(installWay({ ...here, standalone: true, userAgent: IPHONE, touchPoints: 5 })).toBe('installed');
  });
});
