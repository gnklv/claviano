// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hand } from '../src/domain/note';
import { engrave } from '../src/domain/notation/engraving';
import { transcribed } from '../src/domain/notation/transcription';
import { barRange, createScore, EMPTY_SCORE, secondsAtBeat } from '../src/domain/score';
import type { LineShape } from '../src/infrastructure/render/staff/shapes';
import { drawStaff, everything, flat, lit, shaded, texts } from './drawnStaff';
import { ode, showcase, sounding } from './staffPieces';

/*
 * The staff as a view: what it shows of the music under the cursor, where a click lands on the
 * page, and the loop and selection behind the notes, read as the shapes it hands its surface. How
 * the tape moves, is stretched and is dragged is in staffTape.test.ts; what exactly it draws for a
 * piece is kept in the reference copies (snapshot.test.ts); how a canvas draws it, in
 * canvasStaff.test.ts.
 */

afterEach(() => vi.restoreAllMocks());

describe('the staff', () => {
  it('draws nothing but the staves without a piece, and does not mind being asked about it', () => {
    for (const score of [null, EMPTY_SCORE]) {
      const { staff, shown } = drawStaff(score);
      // The staves and their clefs, and no tape.
      expect(shown.column.length).toBeGreaterThan(0);
      expect(shown.tape).toBeNull();
      expect(lit(shown)).toEqual([]);
      expect(staff.pageAt(500)).toBeNull();
      staff.setHover(0);
      staff.setSelection({ from: 0, to: 1 });
      staff.setLoop({ start: 0, end: 1 });
      staff.render(3);
      expect(shaded(shown)).toEqual([]);
    }
  });

  it('draws every piece it is given anew', () => {
    const { staff, shown } = drawStaff(ode());
    const odeShapes = everything(shown).length;
    staff.setScore(showcase());
    expect(everything(shown).length).toBeGreaterThan(odeShapes);
    staff.setScore(ode());
    staff.render(0);
    expect(everything(shown).length).toBe(odeShapes);
  });

  describe('the music under the cursor', () => {
    it('lights the chords sounding there in their hand’s colour', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      for (const beat of [0, 1, 2.5, 7, 16]) {
        staff.render(secondsAtBeat(score, beat) + 1e-3);
        expect(lit(shown).sort(), `at beat ${beat}`).toEqual(sounding(score, beat).sort());
      }
      expect(sounding(score, 0).length).toBeGreaterThan(0);
    });

    it('puts a chord out when the music has passed it', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      staff.render(1e-3);
      const first = lit(shown).length;
      staff.render(score.duration + 1);
      expect(first).toBeGreaterThan(0);
      expect(lit(shown)).toEqual([]);
    });

    it('leaves the chords of a muted hand in ink', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      staff.render(1e-3, (hand) => hand === 'left');
      expect(lit(shown)).toEqual(sounding(score, 0).filter((hand) => hand === 'left'));
      staff.render(1e-3, () => false);
      expect(lit(shown)).toEqual([]);
    });

    it('lights a repeated bar again on every pass', () => {
      const score = showcase();
      const { staff, shown } = drawStaff(score);
      // Two playings of one printed bar: the same chords light up both times.
      const played = score.barWritten.map((written, index) => ({ written, index }));
      const again = played.find(({ written, index }) => played.some((other) => other.written === written && other.index < index))!;
      const before = played.find((other) => other.written === again.written)!;
      const litAt = (bar: number) => {
        staff.render(score.bars[bar] + 1e-3);
        return lit(shown);
      };
      const firstPass = litAt(before.index);
      expect(firstPass.length).toBeGreaterThan(0);
      expect(litAt(again.index)).toEqual(firstPass);
    });

    it('moves the tape with the music, and leaves it alone while the music stands still', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      const start = shown.offset;
      expect(Number.isNaN(start)).toBe(false);
      staff.render(0);
      expect(shown.offset).toBe(start);
      staff.render(score.duration / 2);
      expect(shown.offset).not.toBe(start);
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
      const { staff, shown } = drawStaff(score);
      staff.setLoop(barRange(score, 1, 2));
      const [loop] = shaded(shown);
      expect(shaded(shown).length).toBe(1);
      expect(loop.fill).toBe('loop');
      expect(loop.width).toBeGreaterThan(0);
      // (A line at each of its ends, in the same ink.)
      const edges = () => shown.loop.filter((shape) => shape.kind === 'path' && shape.stroke === 'loopEdge');
      expect(edges()).toHaveLength(2);

      staff.setLoop(barRange(score, 1, 3));
      expect((shaded(shown)[0]).width).toBeGreaterThan(loop.width);
      staff.setLoop(null);
      expect(shaded(shown)).toEqual([]);
      expect(edges()).toEqual([]);
    });

    it('leaves the notes as they are when the loop changes: only its shade is drawn anew', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      const before = shown.tape;
      staff.setLoop(barRange(score, 1, 2));
      staff.setLoop(null);
      // The very same tape, not one drawn again to look the same.
      expect(shown.tape).toBe(before);
    });

    it('keeps the loop’s shade when the piece is drawn anew', () => {
      const score = ode();
      const size = { width: 1024, height: 300 };
      const { staff, shown } = drawStaff(score, size);
      staff.setLoop(barRange(score, 1, 2));
      size.width = 800;
      staff.resize();
      expect(shaded(shown).length).toBe(1);
    });

    it('shades the bar under the pointer faintly, and the bars being selected fully', () => {
      const { staff, shown } = drawStaff(ode());
      staff.setHover(1);
      const hover = shaded(shown)[0];
      expect(hover.opacity).toBe(0.5);

      staff.setSelection({ from: 3, to: 1 });
      const selection = shaded(shown)[0];
      expect(shaded(shown).length).toBe(1);
      expect(selection.opacity).toBe(1);
      expect(selection.x).toBe(hover.x);
      expect(selection.width).toBeCloseTo(3 * hover.width, 3);

      staff.setSelection(null);
      staff.setHover(null);
      expect(shaded(shown)).toEqual([]);
    });

    it('shades no bar past the end of the piece', () => {
      const score = ode();
      const { staff, shown } = drawStaff(score);
      staff.setHover(score.notation.bars.length + 5);
      expect(shaded(shown)).toEqual([]);
    });
  });

  it('draws to its container’s size when that changes', () => {
    // (Drawn anew at once where that is quick: on a clock that stands, it takes no time at all.)
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const size = { width: 1024, height: 300 };
    const { staff, shown } = drawStaff(ode(), size);
    const staffLine = () => shown.column.find((shape): shape is LineShape => shape.kind === 'line')!;
    // (A staff line runs to twice the width: across the view even while that is stretched smaller.)
    expect(staffLine().x2).toBe(2048);
    const shapes = everything(shown).length;

    size.width = 600;
    size.height = 200;
    staff.resize();
    expect(staffLine().x2).toBe(1200);
    staff.render(0);
    expect(everything(shown).length).toBe(shapes);
  });

  it('draws nothing anew when told of a size that has not changed', () => {
    const { staff, shown } = drawStaff(ode());
    const before = shown.tape;
    staff.resize();
    expect(shown.tape).toBe(before);
  });

  it('draws anew for a screen of another density, at the same size (a canvas is drawn for one)', () => {
    const { staff, shown } = drawStaff(ode());
    const before = shown.tape;
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(window.devicePixelRatio + 1);
    staff.resize();
    expect(shown.tape).not.toBe(before);
  });

  it('shows in the left column the clefs and signatures in force where the music is', () => {
    const score = showcase();
    const { staff, shown } = drawStaff(score);
    const column = () => JSON.stringify(shown.column);
    const change = score.notation.keySignatures.find((key) => key.beat > 0)!;
    const at = (beat: number) => secondsAtBeat(score, beat);
    const opening = column();
    staff.render(at(change.beat) + 0.01);
    expect(column()).not.toBe(opening);
    staff.render(at(change.beat / 2));
    expect(column()).toBe(opening);
  });

  it('draws small notes smaller: heads, stems and beams', () => {
    const { shown } = drawStaff(showcase());
    const noteheads = texts(shown).filter((text) => text.font === 'Bravura' && /^[-]$/.test(text.text));
    const sizes = [...new Set(noteheads.map((head) => head.size))].sort((a, b) => b - a);
    // Three sizes of notehead in the piece: full, small (seven tenths of it), and the grace notes' (smaller still).
    const [full, small, grace] = sizes;
    expect(sizes).toHaveLength(3);
    expect(small / full).toBeCloseTo(0.7);
    expect(grace).toBeLessThan(small);
    // Six small heads: the five small chords of bar 25, one of them of two notes.
    expect(noteheads.filter((head) => head.size === small)).toHaveLength(6);
    // Their stems are thinner too.
    const stems = everything(shown).filter((shape): shape is LineShape => shape.kind === 'line' && shape.x1 === shape.x2 && shape.stroke === 'currentColor');
    expect(new Set(stems.map((stem) => stem.width)).size).toBeGreaterThanOrEqual(2);
  });

  it('draws fingering numbers at their chords, lit with them, and brackets round a note that may be left out', () => {
    const score = showcase();
    const { staff, shown } = drawStaff(score);
    const inChords = new Set(flat(shown.tape!.chords).map((each) => each.shape));
    const written = flat(shown.tapeShapes).flatMap(({ shape, group }) => (shape.kind === 'text' ? [{ text: shape, group }] : []));
    // Numbers 0 to 5 come from the music font; "2-1" is set in the text font.
    const numbers = written.filter(({ text }) => /^[-]$/.test(text.text));
    expect(numbers).toHaveLength(7);
    const change = written.find(({ text }) => text.text === '2-1')!;
    expect(change.text.font).not.toBe('Bravura');
    // Each is inside its chord's group, so it lights up with the chord.
    expect([...numbers, change].every(({ text }) => inChords.has(text))).toBe(true);
    const brackets = written.filter(({ text }) => /^[]$/.test(text.text));
    expect(brackets.map(({ text }) => text.text)).toEqual(['', '']);
    expect(brackets[0].group).toBe(change.group);
    staff.render(0);
  });

  describe('words over the staff', () => {
    const find = (shown: ReturnType<typeof drawStaff>['shown'], said: string) => texts(shown).find((text) => text.text === said)!;

    it('prints a tempo in bold with its metronome mark after it on the same line, and other words in italics', () => {
      const { shown } = drawStaff(showcase());
      const tempo = find(shown, 'Slower, piano');
      expect(tempo.bold).toBe(true);
      // The "= 60" that follows it on its line (there is another "= 60" earlier in the piece).
      const after = texts(shown)
        .filter((text) => text.text === '= 60' && text.y === tempo.y)
        .map((text) => text.x - tempo.x)
        .filter((distance) => distance > 0);
      expect(Math.min(...after)).toBeLessThan(250);

      const label = find(shown, 'Beams');
      expect(label.italic).toBe(true);
      expect(label.bold).toBeFalsy();
    });

    it('keeps words clear of high notes under them', () => {
      const { shown } = drawStaff(showcase());
      const staffTop = shown.column.find((shape): shape is LineShape => shape.kind === 'line')!.y1;
      const heights = ['Beams', 'Voices', 'Rests'].map((said) => staffTop - find(shown, said).y);
      // Over the staff, all of them; and those over high notes stand higher than those over none.
      expect(heights.every((height) => height > 0)).toBe(true);
      expect(new Set(heights.map((height) => Math.round(height))).size).toBeGreaterThan(1);
    });

    // (Once, on a staff this tall, words stepping up over other words never stopped: set a line over
    // the others, they still measured as nearer than a line, by the arithmetic of fractions.)
    it.each([300, 410, 600, 900])('find their places on a staff %i px tall', (height) => {
      const { shown } = drawStaff(showcase(), { width: 800, height });
      expect(shown.tape).not.toBeNull();
    });
  });

  it('writes the hand marks in the language it is told', () => {
    // The left hand comes up onto the upper staff: the note it plays there is marked.
    const note = (pitch: number, beat: number, hand: Hand) => ({ pitch, start: beat / 2, duration: 0.5, beat, beats: 1, velocity: 0.7, hand });
    const crossing = transcribed(createScore('crossing', [note(48, 0, 'left'), note(72, 0, 'right'), note(79, 1, 'left'), note(72, 2, 'right')], [0, 2]));
    const { staff, shown } = drawStaff(crossing);
    const said = () => texts(shown).map((text) => text.text);
    expect(said()).toContain('L.H.');
    staff.setHandLabels({ right: 'п. р.', left: 'л. р.' });
    expect(said()).toContain('л. р.');
    expect(said()).not.toContain('L.H.');
  });
});
