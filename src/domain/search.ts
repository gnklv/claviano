/*
 * Binary search over sorted lists, by a numeric key of their items.
 */

/** Index of the last item whose key is at or before `value` (−1 when there is none). */
export function lastAtOrBefore<T>(items: readonly T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]!) <= value) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Index of the first item whose key is at or after `value` (`items.length` when there is none). */
export function firstAtOrAfter<T>(items: readonly T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]!) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
