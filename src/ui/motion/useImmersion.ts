import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';

/** The header and the transport stay this long after the last touch, in milliseconds. */
const AWAKE_MS = 3000;

/**
 * On a short screen (a phone on its side) the music gets the whole of it while it plays: the
 * header and the transport go away a few seconds after the last touch, and a touch brings them
 * back. `immersed`: they are away now. `wake`: a touch.
 */
export function useImmersion(short: Readonly<Ref<boolean>>, playing: Readonly<Ref<boolean>>): { immersed: ComputedRef<boolean>; wake: () => void } {
  const awake = ref(true);
  const wanted = computed(() => short.value && playing.value);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function arm(): void {
    awake.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // (Not from under an open panel: the settings, the tempo.)
      if (document.querySelector('dialog[open]')) arm();
      else awake.value = false;
    }, AWAKE_MS);
  }

  watch(wanted, (on) => {
    clearTimeout(timer);
    awake.value = true;
    if (on) arm();
  });
  onScopeDispose(() => clearTimeout(timer));

  return {
    immersed: computed(() => wanted.value && !awake.value),
    wake: () => {
      if (wanted.value) arm();
    },
  };
}
