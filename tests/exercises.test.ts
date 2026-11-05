import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById, exercisesFor } from '../src/domain/exercises/catalog';
import { exerciseScore } from '../src/domain/exercises/score';
import { midiOf } from '../src/domain/notation/spelling';

describe('C major warmups', () => {
  it('offers progressive exercises with reach-dependent octaves outside warmup', () => {
    expect(exercisesFor('beginner').map(e => e.id)).toEqual(['five-notes', 'five-notes-staccato', 'broken-triad', 'triad']);
    expect(exercisesFor('intermediate')).toHaveLength(7);
    expect(exercisesFor('advanced')).toHaveLength(6);
    expect(exerciseById('octaves').warmup).toBe(false);
  });
  it('rejects hands unsupported by an exercise', () => {
    expect(() => exerciseScore('five-notes', 'both')).toThrow();
  });
  it('prints every finger, complete bars and conservative tempo for every hand choice', () => {
    for (const exercise of EXERCISES)
      for (const hands of exercise.hands) {
        const score = exerciseScore(exercise.id, hands);
        expect(score.notes.length).toBeGreaterThan(0);
        expect(score.notation.tempoMarks[0]?.printed).toBe(true);
        expect(score.notation.keySignatures[0]).toEqual({ beat: 0, fifths: 0, minor: false });
        expect(score.endBeat).toBe(score.notation.bars.length * 4);
        expect(score.duration).toBeCloseTo(score.endBeat * 60 / exercise.tempo);
        for (const note of score.notation.notes) {
          expect(note.fingering?.text).toMatch(/^[1-5]$/);
          expect(note.fingering?.hint).toBeUndefined();
          expect(note.fingering?.own).toBeUndefined();
          expect(note.beat + note.beats).toBeLessThanOrEqual((note.bar + 1) * 4);
          expect(note.staff).toBe(note.hand === 'right' ? 1 : 2);
          expect([0, 2, 4, 5, 7, 9, 11]).toContain(note.sounding % 12);
        }
      }
  });
  it('teaches conventional scale fingering up and down in both hands', () => {
    const right = exerciseScore('scale-one-octave', 'right').notation.notes;
    expect(right.slice(0, 8).map(n => n.sounding)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(right.slice(0, 8).map(n => n.fingering?.text)).toEqual(['1', '2', '3', '1', '2', '3', '4', '5']);
    expect(right.slice(8, 15).map(n => n.fingering?.text)).toEqual(['4', '3', '2', '1', '3', '2', '1']);
    const left = exerciseScore('scale-one-octave', 'left').notation.notes;
    expect(left.slice(0, 8).map(n => n.fingering?.text)).toEqual(['5', '4', '3', '2', '1', '3', '2', '1']);
    const both = exerciseScore('scale-two-octaves', 'both').notation.notes;
    expect(both.find(n => n.hand === 'left')?.sounding).toBe(36);
    expect(both.find(n => n.hand === 'right')?.sounding).toBe(60);
  });
  it('gives each inversion its own fingering and reverses both scales', () => {
    expect(exerciseScore('broken-inversions', 'right').notation.notes.slice(0, 9).map(n => n.fingering?.text)).toEqual(['1', '3', '5', '1', '2', '5', '1', '3', '5']);
    expect(exerciseScore('broken-inversions', 'left').notation.notes.slice(0, 9).map(n => n.fingering?.text)).toEqual(['5', '3', '1', '5', '3', '1', '5', '2', '1']);
    for (const hand of ['right', 'left'] as const) {
      for (const [id, count] of [['scale-one-octave', 8], ['scale-two-octaves', 15]] as const) {
        const notes = exerciseScore(id, hand).notation.notes;
        expect(notes.slice(count, count * 2 - 1).map(n => n.sounding)).toEqual(notes.slice(0, count - 1).map(n => n.sounding).reverse());
        expect(notes.slice(count, count * 2 - 1).map(n => n.fingering?.text)).toEqual(notes.slice(0, count - 1).map(n => n.fingering?.text).reverse());
      }
    }
  });
  it('carries the arpeggio through two octaves with explicit passing fingers', () => {
    const right = exerciseScore('arpeggio', 'right').notation.notes;
    expect(right.slice(0, 7).map(note => note.sounding)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    expect(right.slice(0, 7).map(note => note.fingering?.text)).toEqual(['1', '2', '3', '1', '2', '3', '5']);
    const left = exerciseScore('arpeggio', 'both').notation.notes.filter(note => note.hand === 'left');
    expect(left.slice(0, 7).map(note => note.sounding)).toEqual([36, 40, 43, 48, 52, 55, 60]);
    expect(left.slice(0, 7).map(note => note.fingering?.text)).toEqual(['5', '3', '2', '1', '3', '2', '1']);
    expect(right.slice(7, 13).map(note => note.fingering?.text)).toEqual(['3', '2', '1', '3', '2', '1']);
  });
  it('uses root-position and inversion fingering for left-hand chord changes', () => {
    const notes = exerciseScore('chord-changes', 'left').notation.notes;
    expect(notes.slice(0, 12).map(note => note.fingering?.text)).toEqual(['5', '3', '1', '5', '2', '1', '5', '2', '1', '5', '3', '1']);
  });
  it('plays staccato briefly and prints blocked triads as chords', () => {
    const short = exerciseScore('five-notes-staccato', 'right');
    expect(short.notes[0].duration).toBeLessThan(short.notes[0].beats * 60 / exerciseById('five-notes-staccato').tempo);
    expect(exerciseScore('triad', 'right').notation.notes.slice(0, 3).map(n => n.chord)).toEqual([false, true, true]);
  });
  it('separates fast groups with printed rests and beams their short notes', () => {
    for (const id of ['scale-groups', 'repeated-notes', 'trill'] as const) {
      const score = exerciseScore(id, 'right');
      expect(score.notation.rests.length).toBeGreaterThan(0);
      expect(score.notation.notes.some(n => n.beams.length > 0)).toBe(true);
    }
  });
  it('groups dotted rhythms without an orphaned secondary beam on the short note', () => {
    const notes = exerciseScore('scale-rhythm', 'right').notation.notes;
    expect(notes[0].duration).toEqual({ value: 'eighth', dots: 1 });
    expect(notes[1].duration).toEqual({ value: 'sixteenth', dots: 0 });
    // As in transcription: the engraver derives secondary beams and hooks from note values.
    expect(notes[0].beams).toEqual(['begin']);
    expect(notes[1].beams).toEqual(['end']);
  });
  it('writes all the time each hand plays or rests, and plays the pitches and rhythm on the page', () => {
    const beats = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25, thirtySecond: 0.125 };
    for (const exercise of EXERCISES) {
      for (const hands of exercise.hands) {
        const score = exerciseScore(exercise.id, hands);
        const expectedHands = hands === 'both' ? ['right', 'left'] : [hands];
        expect([...new Set(score.notes.map(note => note.hand))].sort()).toEqual([...expectedHands].sort());
        for (const hand of expectedHands) {
          const staff = hand === 'right' ? 1 : 2;
          const events = [...score.notation.notes.filter(note => note.staff === staff && !note.chord),
            ...score.notation.rests.filter(rest => rest.staff === staff)].sort((a, b) => a.beat - b.beat);
          let end = 0;
          for (const event of events) {
            expect(event.beat).toBe(end);
            end += beats[event.duration.value] * (event.duration.dots ? 1.5 : 1);
          }
          expect(end).toBe(score.endBeat);
        }
        for (const written of score.notation.notes) {
          const played = score.notes.find(note => note.beat === written.beat && note.pitch === written.sounding && note.hand === written.hand);
          expect(played).toBeDefined();
          expect(written.sounding).toBe(midiOf(written.pitch));
          expect(played!.start).toBeCloseTo(written.beat * 60 / exercise.tempo);
          expect(played!.beats).toBe(written.beats);
          if (hands === 'both') {
            expect(score.notes.some(note => note.hand !== written.hand && note.beat === written.beat && note.pitch === written.sounding)).toBe(false);
          }
        }
      }
    }
  });
  it('changes fingers on repeated notes and alternates neighbouring notes in a trill', () => {
    const repeated = exerciseScore('repeated-notes', 'right').notation.notes.slice(0, 8);
    expect(repeated.map(note => note.sounding)).toEqual(Array(8).fill(60));
    expect(repeated.map(note => note.fingering?.text)).toEqual(['3', '2', '1', '3', '2', '1', '3', '2']);
    const trill = exerciseScore('trill', 'left').notation.notes.slice(0, 8);
    expect(trill.map(note => note.sounding)).toEqual([48, 50, 48, 50, 48, 50, 48, 50]);
    expect(trill.map(note => note.fingering?.text)).toEqual(['3', '2', '3', '2', '3', '2', '3', '2']);
  });
});
