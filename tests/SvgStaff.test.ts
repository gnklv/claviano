// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { odeToJoy } from '../src/demo/odeToJoy';
import type { Hand } from '../src/domain/note';
import { engrave } from '../src/domain/notation/engraving';
import { transcribed } from '../src/domain/notation/transcription';
import { barRange, createScore, EMPTY_SCORE, secondsAtBeat, type Score } from '../src/domain/score';
import { MusicXmlParser } from '../src/infrastructure/parsers/MusicXmlParser';
import { drawStaff } from './drawnStaff';

/*
 * The staff as a view: what it shows of the music under the cursor, where a click lands on the
 * page, and the loop and selection behind the notes. What exactly it draws for a piece is kept in
 * the reference copies (snapshot.test.ts).
 */

const showcase = (): Score => {
  const file = readFileSync('public/demos/showcase.musicxml');
  return new MusicXmlParser().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'showcase');
};
const ode = (): Score => odeToJoy('Ode to Joy');

const HAND_COLORS: Record<string, Hand> = { 'var(--right)': 'right', 'var(--left)': 'left' };

/** The hands of the groups lit in a hand's colour, in the order they are drawn. */
const lit = (container: HTMLElement): Hand[] =>
  [...container.querySelectorAll<SVGGElement>('g')].flatMap((group) => HAND_COLORS[group.style.color] ?? []);

/** The hands of the chords sounding at `beat` along the page, as the engraving has them. */
const sounding = (score: Score, beat: number): Hand[] =>
  engrave(score)
    .chords.filter((chord) => chord.beat <= beat + 1e-9 && chord.beat + chord.beats > beat + 1e-9)
    .map((chord) => chord.hand);

const shaded = (container: HTMLElement): SVGRectElement[] => [...container.querySelectorAll<SVGRectElement>('rect')];

describe('SvgStaff', () => {
  it('draws nothing but the staves without a piece, and does not mind being asked about it', () => {
    for (const score of [null, EMPTY_SCORE]) {
      const { staff, container } = drawStaff(score);
      expect(container.querySelectorAll('svg').length).toBe(2);
      expect(lit(container)).toEqual([]);
      expect(staff.pageAt(500)).toBeNull();
      staff.setHover(0);
      staff.setSelection({ from: 0, to: 1 });
      staff.setLoop({ start: 0, end: 1 });
      staff.render(3);
      expect(shaded(container)).toEqual([]);
    }
  });

  it('draws every piece it is given anew', () => {
    const { staff, container } = drawStaff(ode());
    const odeElements = container.querySelectorAll('svg *').length;
    staff.setScore(showcase());
    expect(container.querySelectorAll('svg *').length).toBeGreaterThan(odeElements);
    staff.setScore(ode());
    expect(container.querySelectorAll('svg *').length).toBe(odeElements);
  });

  describe('the music under the cursor', () => {
    it('lights the chords sounding there in their hand’s colour', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      for (const beat of [0, 1, 2.5, 7, 16]) {
        staff.render(secondsAtBeat(score, beat) + 1e-3);
        expect(lit(container).sort(), `at beat ${beat}`).toEqual(sounding(score, beat).sort());
      }
      expect(sounding(score, 0).length).toBeGreaterThan(0);
    });

    it('puts a chord out when the music has passed it', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      staff.render(1e-3);
      const first = lit(container).length;
      staff.render(score.duration + 1);
      expect(first).toBeGreaterThan(0);
      expect(lit(container)).toEqual([]);
    });

    it('leaves the chords of a muted hand in ink', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      staff.render(1e-3, (hand) => hand === 'left');
      expect(lit(container)).toEqual(sounding(score, 0).filter((hand) => hand === 'left'));
      staff.render(1e-3, () => false);
      expect(lit(container)).toEqual([]);
    });

    it('lights a repeated bar again on every pass', () => {
      const score = showcase();
      const { staff, container } = drawStaff(score);
      // Two playings of one printed bar: the same chords light up both times.
      const played = score.barWritten.map((written, index) => ({ written, index }));
      const again = played.find(({ written, index }) => played.some((other) => other.written === written && other.index < index))!;
      const before = played.find((other) => other.written === again.written)!;
      const litAt = (bar: number) => {
        staff.render(score.bars[bar] + 1e-3);
        return lit(container);
      };
      const firstPass = litAt(before.index);
      expect(firstPass.length).toBeGreaterThan(0);
      expect(litAt(again.index)).toEqual(firstPass);
    });

    it('moves the tape with the music, and leaves it alone while the music stands still', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      const tape = container.querySelectorAll('svg')[1];
      const start = tape.style.transform;
      expect(start).toMatch(/^translateX\(/);
      staff.render(0);
      expect(tape.style.transform).toBe(start);
      staff.render(score.duration / 2);
      expect(tape.style.transform).not.toBe(start);
    });
  });

  describe('a place on the page', () => {
    /** Every place a pointer can be at across the tape as it stands, left to right. */
    const placesAcross = (staff: ReturnType<typeof drawStaff>['staff']) =>
      Array.from({ length: 400 }, (_, i) => staff.pageAt(i * 5)).filter((place) => place !== null);

    it('goes on through the bars from left to right', () => {
      const score = ode();
      const { staff } = drawStaff(score);
      const places = placesAcross(staff);
      expect(places[0].bar).toBe(0);
      expect(places.length).toBeGreaterThan(50);
      places.forEach((place, i) => {
        const previous = places[i - 1];
        if (previous) expect(place.bar > previous.bar || (place.bar === previous.bar && place.beat >= previous.beat)).toBe(true);
        const bar = score.notation.bars[place.bar];
        expect(place.beat).toBeGreaterThanOrEqual(bar.start - 1e-9);
        expect(place.beat).toBeLessThanOrEqual(bar.start + bar.length + 1e-9);
      });
    });

    it('snaps to the note beside it', () => {
      const score = ode();
      const { staff } = drawStaff(score);
      const beats = new Set(engrave(score).chords.map((chord) => chord.beat));
      const onNotes = placesAcross(staff).filter((place) => beats.has(place.beat));
      // Several pointer places in a row give one and the same note.
      expect(new Set(onNotes.map((place) => place.beat)).size).toBeLessThan(onNotes.length);
      expect(onNotes.some((place) => place.beat === 0)).toBe(true);
    });
  });

  describe('behind the notes', () => {
    it('shades the loop, and takes the shade away with it', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      staff.setLoop(barRange(score, 1, 2));
      const [loop] = shaded(container);
      expect(shaded(container).length).toBe(1);
      expect(loop.style.fill).toBe('var(--loop)');
      expect(Number(loop.getAttribute('width'))).toBeGreaterThan(0);
      // (A line at each of its ends, in the same ink.)
      const edges = () => [...container.querySelectorAll<SVGPathElement>('path')].filter((path) => path.style.stroke === 'var(--loop-edge)');
      expect(edges()).toHaveLength(2);

      staff.setLoop(barRange(score, 1, 3));
      expect(Number(shaded(container)[0].getAttribute('width'))).toBeGreaterThan(Number(loop.getAttribute('width')));
      staff.setLoop(null);
      expect(shaded(container)).toEqual([]);
      expect(edges()).toEqual([]);
    });

    it('leaves the notes as they are when the loop changes: only its shade is drawn anew', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      const notes = () => [...container.querySelectorAll('text')];
      const before = notes();
      staff.setLoop(barRange(score, 1, 2));
      staff.setLoop(null);
      // The very same elements, not ones drawn again to look the same.
      expect(notes().every((note, i) => note === before[i])).toBe(true);
      expect(notes().length).toBe(before.length);
    });

    it('keeps the loop’s shade when the piece is drawn anew', () => {
      const score = ode();
      const size = { width: 1024, height: 300 };
      const { staff, container } = drawStaff(score, size);
      staff.setLoop(barRange(score, 1, 2));
      size.width = 800;
      staff.resize();
      expect(shaded(container).length).toBe(1);
    });

    it('shades the bar under the pointer faintly, and the bars being selected fully', () => {
      const { staff, container } = drawStaff(ode());
      staff.setHover(1);
      const hover = shaded(container)[0];
      expect(hover.style.opacity).toBe('0.5');

      staff.setSelection({ from: 3, to: 1 });
      const selection = shaded(container)[0];
      expect(shaded(container).length).toBe(1);
      expect(selection.style.opacity).toBe('1');
      expect(selection.getAttribute('x')).toBe(hover.getAttribute('x'));
      expect(Number(selection.getAttribute('width'))).toBeCloseTo(3 * Number(hover.getAttribute('width')), 3);

      staff.setSelection(null);
      staff.setHover(null);
      expect(shaded(container)).toEqual([]);
    });

    it('shades no bar past the end of the piece', () => {
      const score = ode();
      const { staff, container } = drawStaff(score);
      staff.setHover(score.notation.bars.length + 5);
      expect(shaded(container)).toEqual([]);
    });
  });

  it('draws to its container’s size when that changes', () => {
    const size = { width: 1024, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    const staffLine = () => container.querySelector('line')!;
    // (A staff line runs to twice the width: across the view even while that is stretched smaller.)
    expect(staffLine().getAttribute('x2')).toBe('2048');
    const elements = container.querySelectorAll('svg *').length;

    size.width = 600;
    size.height = 200;
    staff.resize();
    expect(staffLine().getAttribute('x2')).toBe('1200');
    expect(container.querySelectorAll('svg *').length).toBe(elements);
  });

  it('draws nothing anew when told of a size that has not changed', () => {
    const { staff, container } = drawStaff(ode());
    const before = [...container.querySelectorAll('svg *')];
    staff.resize();
    const after = [...container.querySelectorAll('svg *')];
    expect(after.length).toBe(before.length);
    expect(after.every((element, i) => element === before[i])).toBe(true);
  });

  it('draws small notes smaller: heads, stems and beams', () => {
    const { container } = drawStaff(showcase());
    const noteheads = [...container.querySelectorAll('text')].filter((text) => text.getAttribute('font-family') === 'Bravura' && /^[-]$/.test(text.textContent));
    const sizes = [...new Set(noteheads.map((head) => Number(head.getAttribute('font-size'))))].sort((a, b) => b - a);
    // Three sizes of notehead in the piece: full, small (seven tenths of it), and the grace notes' (smaller still).
    const [full, small, grace] = sizes;
    expect(sizes).toHaveLength(3);
    expect(small / full).toBeCloseTo(0.7);
    expect(grace).toBeLessThan(small);
    // Six small heads: the five small chords of bar 25, one of them of two notes.
    expect(noteheads.filter((head) => Number(head.getAttribute('font-size')) === small)).toHaveLength(6);
    // Their stems are thinner too.
    const stems = [...container.querySelectorAll('line')].filter((line) => line.getAttribute('x1') === line.getAttribute('x2') && line.style.stroke === 'currentColor');
    expect(new Set(stems.map((stem) => stem.getAttribute('stroke-width'))).size).toBeGreaterThanOrEqual(2);
  });

  it('draws fingering numbers at their chords, lit with them, and brackets round a note that may be left out', () => {
    const score = showcase();
    const { staff, container } = drawStaff(score);
    const texts = [...container.querySelectorAll('text')];
    // Numbers 0 to 5 come from the music font; "2-1" is set in the text font.
    const numbers = texts.filter((text) => /^[-]$/.test(text.textContent));
    expect(numbers).toHaveLength(7);
    const change = texts.find((text) => text.textContent === '2-1')!;
    expect(change.getAttribute('font-family')).not.toBe('Bravura');
    // Each is inside its chord's group, so it lights up with the chord.
    expect([...numbers, change].every((text) => text.parentElement?.tagName === 'g' && text.parentElement.style.color !== '')).toBe(true);
    const brackets = texts.filter((text) => /^[]$/.test(text.textContent));
    expect(brackets.map((text) => text.textContent)).toEqual(['', '']);
    expect(brackets[0].parentElement).toBe(change.parentElement);
    staff.render(0);
  });

  describe('words over the staff', () => {
    const texts = (container: HTMLElement) => [...container.querySelectorAll('text')];
    const find = (container: HTMLElement, said: string) => texts(container).find((text) => text.textContent === said)!;

    it('prints a tempo in bold with its metronome mark after it on the same line, and other words in italics', () => {
      const { container } = drawStaff(showcase());
      const tempo = find(container, 'Slower, piano');
      expect(tempo.getAttribute('font-weight')).toBe('bold');
      // The "= 60" that follows it on its line (there is another "= 60" earlier in the piece).
      const after = texts(container)
        .filter((text) => text.textContent === '= 60' && text.getAttribute('y') === tempo.getAttribute('y'))
        .map((text) => Number(text.getAttribute('x')) - Number(tempo.getAttribute('x')))
        .filter((distance) => distance > 0);
      expect(Math.min(...after)).toBeLessThan(250);

      const label = find(container, 'Beams');
      expect(label.getAttribute('font-style')).toBe('italic');
      expect(label.getAttribute('font-weight')).toBeNull();
    });

    it('keeps words clear of high notes under them', () => {
      const { container } = drawStaff(showcase());
      const staffTop = Number(container.querySelector('line')!.getAttribute('y1'));
      const heights = ['Beams', 'Voices', 'Rests'].map((said) => staffTop - Number(find(container, said).getAttribute('y')));
      // Over the staff, all of them; and those over high notes stand higher than those over none.
      expect(heights.every((height) => height > 0)).toBe(true);
      expect(new Set(heights.map((height) => Math.round(height))).size).toBeGreaterThan(1);
    });

    // (Once, on a staff this tall, words stepping up over other words never stopped: set a line over
    // the others, they still measured as nearer than a line, by the arithmetic of fractions.)
    it.each([300, 410, 600, 900])('find their places on a staff %i px tall', (height) => {
      const { container } = drawStaff(showcase(), { width: 800, height });
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });

  it('writes the hand marks in the language it is told', () => {
    // The left hand comes up onto the upper staff: the note it plays there is marked.
    const note = (pitch: number, beat: number, hand: Hand) => ({ pitch, start: beat / 2, duration: 0.5, beat, beats: 1, velocity: 0.7, hand });
    const crossing = transcribed(createScore('crossing', [note(48, 0, 'left'), note(72, 0, 'right'), note(79, 1, 'left'), note(72, 2, 'right')], [0, 2]));
    const { staff, container } = drawStaff(crossing);
    const texts = () => [...container.querySelectorAll('text')].map((text) => text.textContent);
    expect(texts()).toContain('L.H.');
    staff.setHandLabels({ right: 'п. р.', left: 'л. р.' });
    expect(texts()).toContain('л. р.');
    expect(texts()).not.toContain('L.H.');
  });
});

describe('a staff whose size is on the move', () => {
  /** A clock on which every look takes `step` ms: drawing the piece anew is seen to take that long. */
  let step: number;
  let time: number;
  beforeEach(() => {
    time = 0;
    step = 20;
    // (Only the timers are set by hand: the clock is this test's own.)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(performance, 'now').mockImplementation(() => (time += step));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const transformOf = (container: HTMLElement) => (container.lastElementChild as HTMLElement).style.transform;
  /** The tape: its last drawn thing, which is another one when the tape is drawn anew. */
  const tape = (container: HTMLElement) => container.children[1].querySelector('svg > g')!;
  const notes = (container: HTMLElement) => tape(container).children.length;
  const firstNote = (container: HTMLElement) => tape(container).lastElementChild;

  it('is drawn anew at once for a size told by itself', () => {
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    const before = firstNote(container);
    time += 1000;
    size.height = 200;
    staff.resize();
    expect(firstNote(container)).not.toBe(before);
    expect(transformOf(container)).toBe('');
  });

  it('is stretched through sizes told one after another, where drawing anew takes longer than a frame, and drawn anew when they stop', () => {
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    time += 1000;
    size.height = 290;
    staff.resize();
    const drawn = firstNote(container);

    // A strip of the screen folding away: a new size at every frame.
    for (const height of [270, 240, 210, 200]) {
      size.height = height;
      staff.resize();
      expect(firstNote(container)).toBe(drawn);
    }
    // Smaller, as the staff would be at that height, and in the middle of it.
    expect(transformOf(container)).toMatch(/^translate\(0px, [\d.-]+px\) scale\(0\.\d+\)$/);

    vi.advanceTimersByTime(200);
    expect(transformOf(container)).toBe('');
    expect(firstNote(container)).not.toBe(drawn);
    expect(notes(container)).toBeGreaterThan(0);
  });

  it('is drawn anew at every size where that is quick', () => {
    step = 1;
    const size = { width: 800, height: 300 };
    const { staff, container } = drawStaff(ode(), size);
    for (const height of [290, 270, 240]) {
      const before = firstNote(container);
      size.height = height;
      staff.resize();
      expect(firstNote(container)).not.toBe(before);
      expect(transformOf(container)).toBe('');
    }
  });
});


describe('a piece many screens long', () => {
  beforeEach(() => {
    // The test DOM lays nothing out: a shape is taken to stand where its first written place is.
    vi.spyOn(SVGGraphicsElement.prototype, 'getBBox').mockImplementation(function (this: SVGGraphicsElement) {
      const placed = [this, ...this.querySelectorAll('*')].find((shape) => shape.hasAttribute('x'));
      const x = Number(placed?.getAttribute('x') ?? 0);
      return { x, y: 0, width: placed ? 1 : 0, height: placed ? 1 : 0 } as DOMRect;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const signs = (container: HTMLElement) =>
    [...container.children[1].querySelectorAll('text')]
      .map((text) => ({ x: Number(text.getAttribute('x')), shown: !text.closest('[style*="display: none"]') }))
      .sort((a, b) => a.x - b.x);

  it('shows the tape near the view only, and more of it as the music moves on', () => {
    const score = showcase();
    const { staff, container } = drawStaff(score, { width: 800, height: 300 });
    /** The signs within the first 400 pixels of the view. */
    const inView = () => {
      const left = -Number(/translateX\(([-\d.]+)/.exec(container.children[1].querySelector('svg')!.style.transform)![1]);
      return signs(container).filter((sign) => sign.x >= left && sign.x < left + 400);
    };
    expect(inView().length).toBeGreaterThan(0);
    expect(inView().every((sign) => sign.shown)).toBe(true);
    expect(signs(container).at(-1)!.shown).toBe(false);

    // Halfway through. (A leap so far is glided over: a second of frames, on a clock set by hand.)
    let time = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 100));
    for (let frame = 0; frame < 10; frame++) staff.render(score.duration / 2);
    expect(inView().length).toBeGreaterThan(0);
    expect(inView().every((sign) => sign.shown)).toBe(true);
    expect(signs(container).filter((sign) => sign.x < 400).some((sign) => sign.shown)).toBe(false);
  });
});
