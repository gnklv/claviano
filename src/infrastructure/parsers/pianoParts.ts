/*
 * Some programs write a piano as two parts of one staff each (the right hand, then the left)
 * instead of one part on two staves. Joined back into one part, the reader sees the usual piano:
 * the first part on the upper staff, the second on the lower one.
 */

/** Elements whose <duration> is counted in divisions. */
const TIMED = ['note', 'backup', 'forward'];

/**
 * The part to read: the first one, or both joined when the score is exactly two parts of one
 * staff each with as many bars (the document is changed in place).
 */
export function pianoPart(root: Element): Element | null {
  const parts = [...root.querySelectorAll(':scope > part')];
  const [upper, lower] = parts;
  if (parts.length !== 2 || !isOneStaff(upper) || !isOneStaff(lower)) return upper ?? null;
  const upperBars = measuresOf(upper);
  const lowerBars = measuresOf(lower);
  if (upperBars.length !== lowerBars.length || upperBars.length === 0) return upper;

  // Both parts in one time unit, so the lower part's lengths mean the same in the upper one.
  const divisions = [...root.querySelectorAll(':scope > part > measure > attributes > divisions')].map((d) => Number(d.textContent));
  const common = divisions.filter((d) => Number.isInteger(d) && d > 0).reduce(lcm, 1);
  rescale(upper, common);
  rescale(lower, common);

  const document = root.ownerDocument;
  const element = (name: string, text?: string) => {
    const created = document.createElementNS(root.namespaceURI, name); // not createElement: that is HTML's
    if (text !== undefined) created.textContent = text;
    return created;
  };
  const setChild = (parent: Element, name: string, text: string) => {
    const child = parent.querySelector(`:scope > ${name}`) ?? parent.appendChild(element(name));
    child.textContent = text;
  };

  // Two staves from the start, before any note is read.
  const first = upperBars[0]!;
  const attributes = first.querySelector(':scope > attributes') ?? first.insertBefore(element('attributes'), first.firstChild);
  setChild(attributes, 'staves', '2');

  upperBars.forEach((bar, i) => {
    // Back to the start of the bar, then the left hand's bar on the lower staff.
    const reached = position(bar);
    if (reached > 0) bar.appendChild(element('backup')).appendChild(element('duration', String(reached)));
    for (const child of [...lowerBars[i]!.children]) {
      switch (child.nodeName) {
        case 'attributes':
          // The upper part already sets the key, time and staves: keep the lower staff's clef and the unit.
          for (const setting of [...child.children]) {
            if (setting.nodeName === 'clef') setting.setAttribute('number', '2');
            else if (setting.nodeName !== 'divisions') setting.remove();
          }
          if (child.children.length > 0) bar.appendChild(child);
          break;
        case 'note':
        case 'direction':
        case 'forward':
          setChild(child, 'staff', '2');
          if (child.nodeName === 'note') {
            // Voices of their own, as on a piano part's lower staff.
            const voice = child.querySelector(':scope > voice');
            if (voice && /^\d+$/.test(voice.textContent?.trim() ?? '')) voice.textContent = String(Number(voice.textContent) + 4);
          }
          bar.appendChild(child);
          break;
        case 'backup':
        case 'sound':
          bar.appendChild(child);
          break;
        // Bar lines, repeats and layout come from the upper part.
      }
    }
  });
  lower.remove();
  return upper;
}

const measuresOf = (part: Element) => [...part.querySelectorAll(':scope > measure')];

function isOneStaff(part: Element | undefined): part is Element {
  if (!part) return false;
  return [...part.querySelectorAll(':scope > measure > attributes > staves')].every((s) => Number(s.textContent) <= 1);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Counts all lengths in `divisions` per quarter note, whatever the part said. */
function rescale(part: Element, divisions: number): void {
  let current = 1;
  for (const bar of measuresOf(part)) {
    for (const child of bar.children) {
      const own = child.nodeName === 'attributes' ? child.querySelector(':scope > divisions') : null;
      if (own) {
        current = Number(own.textContent) || current;
        own.textContent = String(divisions);
      }
      const factor = divisions / current;
      if (factor === 1) continue;
      const lengths = TIMED.includes(child.nodeName)
        ? [child.querySelector(':scope > duration')]
        : [child.querySelector(':scope > offset'), child.querySelector(':scope > sound > offset')];
      for (const length of lengths) {
        if (length?.textContent) length.textContent = String(Number(length.textContent) * factor);
      }
    }
  }
}

/** Where a bar's content ends up, in divisions from its start (what a <backup> must undo). */
function position(bar: Element): number {
  let cursor = 0;
  for (const child of bar.children) {
    const duration = Number(child.querySelector(':scope > duration')?.textContent ?? 0);
    if (child.nodeName === 'backup') cursor -= duration;
    else if (child.nodeName === 'forward') cursor += duration;
    else if (child.nodeName === 'note' && !child.querySelector(':scope > chord') && !child.querySelector(':scope > grace')) cursor += duration;
  }
  return cursor;
}
