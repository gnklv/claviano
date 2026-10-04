import type { SettingsStore } from '../../application/ports/SettingsStore';

/** Settings kept in the browser's localStorage, as JSON under one key. */
export class LocalSettingsStore implements SettingsStore {
  constructor(private readonly key: string) {}

  load(): unknown {
    try {
      const saved = localStorage.getItem(this.key);
      return saved === null ? null : (JSON.parse(saved) as unknown);
    } catch {
      // Storage can be unavailable (private browsing, a blocked site) or hold something else.
      return null;
    }
  }

  save(settings: unknown): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(settings));
    } catch {
      // Not remembering the choice is fine.
    }
  }
}
