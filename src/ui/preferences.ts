import { ref, watch, type Ref } from 'vue';

/*
 * The interface's own choices, kept between visits: the view, the theme, the language, whether
 * hints are shown. One way of keeping them (docs/rules.md): each is a ref that is read from the
 * browser's storage when first asked for and written back when it changes. Storage may be
 * missing (a private window): then a choice lasts for the visit.
 *
 * (What is kept of practising, the metronome and the volume, is the application's: it goes
 * through the SettingsStore port. These are only how the interface looks.)
 */

interface Kept {
  readonly key: string;
  readonly allowed: readonly string[];
  readonly fallback: () => string;
  readonly value: Ref<string>;
}

const kept: Kept[] = [];
/** While the choices are being read back from storage, they are not written to it. */
let reading = false;

function read(key: string, allowed: readonly string[], fallback: () => string): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && allowed.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable; the fallback is fine.
  }
  return fallback();
}

/**
 * A choice among `allowed`, kept under `key`: one ref for the whole app, whoever asks. `fallback`
 * is what it is until something is chosen (a value, or how to find one: the browser's language).
 */
export function preference<T extends string>(key: string, allowed: readonly T[], fallback: T | (() => T)): Ref<T> {
  const found = kept.find((choice) => choice.key === key);
  if (found) return found.value as Ref<T>;

  const byDefault = typeof fallback === 'function' ? fallback : () => fallback;
  const value = ref(read(key, allowed, byDefault));
  watch(
    value,
    (now) => {
      if (reading) return;
      try {
        localStorage.setItem(key, now);
      } catch {
        // Not remembering the choice is fine.
      }
    },
    { flush: 'sync' },
  );
  // Another tab of the app has chosen: this one follows.
  if (kept.length === 0) window.addEventListener('storage', rereadPreferences);
  kept.push({ key, allowed, fallback: byDefault, value });
  return value as Ref<T>;
}

/** Reads every choice again from storage: it has changed under us (another tab; a test that starts afresh). */
export function rereadPreferences(): void {
  reading = true;
  for (const choice of kept) choice.value.value = read(choice.key, choice.allowed, choice.fallback);
  reading = false;
}
