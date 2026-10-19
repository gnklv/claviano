import { onScopeDispose, ref, type Ref } from 'vue';

/** A phone held upright. */
const NARROW_SCREEN = '(max-width: 599px)';
/** A phone on its side (or a window as low). */
export const SHORT_SCREEN = '(max-height: 500px)';
/** A screen that is touched, not pointed at: a phone, a tablet. */
export const TOUCH_SCREEN = '(pointer: coarse)';
/** Either: no room for all the tools at once. */
export const SMALL_SCREEN = `${NARROW_SCREEN}, ${SHORT_SCREEN}`;

/** Whether a media query holds now, kept up to date as the window changes. */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const media = window.matchMedia(query);
  const matches = ref(media.matches);
  const update = () => (matches.value = media.matches);
  media.addEventListener('change', update);
  onScopeDispose(() => media.removeEventListener('change', update));
  return matches;
}
