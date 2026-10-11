// @vitest-environment happy-dom
import { createApp } from 'vue';
import { describe, expect, it } from 'vitest';
import AppIcon from '../src/ui/components/AppIcon.vue';
import { ICONS, ICON_NAMES, type IconName } from '../src/ui/icons/icons';

describe('the icons', () => {
  it('each draws something', () => {
    for (const name of ICON_NAMES) {
      const parts = ICONS[name];
      expect(parts.length, name).toBeGreaterThan(0);
      for (const { d } of parts) expect(d, name).toMatch(/^M[\d\s.a-zA-Z-]+$/);
    }
  });

  it('an icon is a picture only: the button around it carries the name', () => {
    const host = document.createElement('div');
    const shown: { name: IconName } = { name: 'play' };
    const app = createApp(AppIcon, shown);
    app.mount(host);
    const icon = host.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelectorAll('path')).toHaveLength(ICONS.play.length);
    app.unmount();
  });
});
