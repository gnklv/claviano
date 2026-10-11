import { onScopeDispose, ref, type Ref } from 'vue';

/** Whether a media query holds now, kept up to date as the window changes. */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const media = window.matchMedia(query);
  const matches = ref(media.matches);
  const update = () => (matches.value = media.matches);
  media.addEventListener('change', update);
  onScopeDispose(() => media.removeEventListener('change', update));
  return matches;
}
