import type { Score } from '../src/domain/score';
import { SvgStaff } from '../src/infrastructure/render/SvgStaff';

/* A staff drawn in the test DOM (which has no layout: the container is given its size), and what it drew, as text. */

export function drawStaff(score: Score | null, size = { width: 1024, height: 300 }): { staff: SvgStaff; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientWidth: { get: () => size.width, configurable: true },
    clientHeight: { get: () => size.height, configurable: true },
  });
  const staff = new SvgStaff(container);
  staff.setScore(score);
  staff.render(0);
  return { staff, container };
}

/** Numbers to a hundredth of a pixel: the noise of arithmetic is not a change in the drawing. */
const rounded = (text: string): string => text.replace(/-?\d+\.\d+/g, (number) => String(Math.round(Number(number) * 100) / 100));

/** Music glyphs are private-use characters: by their code, so the file reads in any font. */
const spelled = (text: string): string => [...text].map((c) => (c.codePointAt(0)! >= 0xe000 ? `U+${c.codePointAt(0)!.toString(16).toUpperCase()}` : c)).join('');

/** One line for each element drawn, nested as in the drawing: its tag, attributes, paint and text. */
export function drawing(element: Element, depth = 0): string {
  const attributes = [...element.attributes]
    .map((attribute) => `${attribute.name}="${rounded(attribute.value)}"`)
    .sort()
    .join(' ');
  const text = element.children.length === 0 && element.textContent ? ` ${spelled(element.textContent)}` : '';
  const line = `${'  '.repeat(depth)}${element.tagName}${attributes ? ` ${attributes}` : ''}${text}\n`;
  return line + [...element.children].map((child) => drawing(child, depth + 1)).join('');
}
