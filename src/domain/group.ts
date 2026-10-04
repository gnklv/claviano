/** A list that has at least one item. */
export type NonEmpty<T> = [T, ...T[]];

/** Groups items by a key, keeping the order they come in within each group and the order groups first appear. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, NonEmpty<T>> {
  const groups = new Map<string, NonEmpty<T>>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
