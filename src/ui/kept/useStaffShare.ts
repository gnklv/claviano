import { computed, type WritableComputedRef } from 'vue';
import { preference } from './preferences';

/*
 * In the view of both, the staff's share of the stage's height, in percent: as one likes it (a
 * larger staff reads better, a smaller one shows more bars ahead), kept between visits, one for
 * the whole app as the view is. Kept to the percent: no finer is seen.
 *
 * By default 45: by eye at 1280×800 on "Ode to Joy" and the showcase, the staff large enough to
 * read and the bars ahead still more than two.
 */
export const STAFF_SHARE = { least: 25, most: 75, byDefault: 45 } as const;

const SHARES = Array.from({ length: STAFF_SHARE.most - STAFF_SHARE.least + 1 }, (_, i) => String(STAFF_SHARE.least + i));
const kept = preference('claviano.staffShare', SHARES, String(STAFF_SHARE.byDefault));

export function useStaffShare(): WritableComputedRef<number> {
  return computed({
    get: () => Number(kept.value),
    set: (share) => (kept.value = String(Math.min(STAFF_SHARE.most, Math.max(STAFF_SHARE.least, Math.round(share))))),
  });
}
