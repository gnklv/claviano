const DAY_MS = 24 * 60 * 60 * 1000;
/** Up to this many days ago a day is said in words ("3 days ago"); further back, by its date. */
const DAYS_IN_WORDS = 30;

const startOfDay = (time: number): number => new Date(time).setHours(0, 0, 0, 0);

/** A day as one says it looking back from `now`: "today", "yesterday", "3 days ago", then "12 September" (with the year, when it is another one). */
export function relativeDay(then: number, now: number, locale: string): string {
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS));
  if (days <= DAYS_IN_WORDS) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(then);
}
