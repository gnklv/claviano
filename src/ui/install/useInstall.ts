import { computed, ref, type ComputedRef } from 'vue';
import { installWay, type InstallWay } from './installWay';

/*
 * Installing the app (a phone's home screen, a computer's dock). Browsers differ:
 * - Chrome and its kin tell the page when it can be installed, and let it ask ("beforeinstallprompt");
 * - an iPhone or iPad has no such thing: one adds the page to the home screen by hand, from "Share";
 * - elsewhere (Firefox, Safari on a Mac) the page has no say: the browser's own menu, if any.
 */

/** The browser's offer to install, kept from when it was made: asking is its `prompt`. */
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
}

const offer = ref<InstallOffer | null>(null);
/** Running as an installed app: in a window of its own. */
const standalone = ref(window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

// (Listened for from the start: the offer is made once, soon after the page loads.)
window.addEventListener('beforeinstallprompt', (event) => {
  // The browser's own banner is not shown: the app offers it in its settings.
  event.preventDefault();
  offer.value = event as InstallOffer;
});
window.addEventListener('appinstalled', () => {
  offer.value = null;
  standalone.value = true;
});

export function useInstall(): { way: ComputedRef<InstallWay>; install: () => void } {
  return {
    way: computed(() => installWay({ standalone: standalone.value, canPrompt: offer.value !== null, userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints })),
    install: () => {
      // (An offer is good for one asking.)
      void offer.value?.prompt().catch(() => {});
      offer.value = null;
    },
  };
}
