// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attributes, note, score } from '../musicXmlScore';
import { audio, drop, learn, plan, playback, root, settled, turnIntoPhone, useApp, way } from './harness';

useApp();

const decorated = () => new TextDecoder().decode(score(`<measure number="1">${attributes(2, 0, 2)}
  <note><grace/><pitch><step>F</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>
  ${note('D', 5, 4, { extra: '<voice>1</voice><notations><ornaments><trill-mark/></ornaments></notations>' })}
  ${note('A', 4, 4, { extra: '<voice>1</voice><chord/>' })}
  <backup><duration>4</duration></backup>
  ${note('D', 3, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('F', 3, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('A', 2, 2, { staff: 2, extra: '<voice>5</voice>' })}</measure>`));

describe('learning the principal notes before their ornaments', () => {
  it('begins with a sustained principal and keeps the original piece open', async () => {
    await drop('ornaments.musicxml', decorated());
    const original = playback.score!;
    await learn();
    expect(playback.plain).toBe(true);
    expect(playback.performanceScore!.notes.every((note) => note.sources?.every((source) => source.kind === 'note'))).toBe(true);
    await playback.play();
    expect(audio.played.map((note) => note.pitch)).toEqual([74]);
    expect(audio.played[0].duration).toBeCloseTo(original.duration / playback.tempo);
    expect(playback.score).toBe(original);
  });

  it.each([false, true])('prepares the complete plain fragment before asking to add the original ornaments (phone: %s)', async (phone) => {
    if (phone) await turnIntoPhone();
    await drop('ornaments.musicxml', decorated());
    await learn();
    const original = playback.score;
    const plain = plan.steps.findIndex((step) => step.kind === 'layer' && step.layer === 'full' && step.plain);
    expect(plain).toBeGreaterThanOrEqual(0);
    plan.start(plain);
    await settled();
    expect(root.querySelector('.step-bar')?.textContent).toContain('Play without ornaments');
    if (phone) expect(root.querySelector('.step-bar .how.in-place')?.textContent).toContain('Play without ornaments');
    expect(playback.plain).toBe(true);
    plan.finish();
    await settled();
    expect(root.querySelector('.step-bar')?.textContent).toContain('Add the ornaments');
    if (phone) expect(root.querySelector('.step-bar .how.in-place')?.textContent).toContain('Add the ornaments');
    expect(playback.plain).toBe(false);
    expect(playback.performanceScore).toBe(original);
    expect(playback.noteSelection).toBeNull();
    expect(playback.playing).toBe(false);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
  });

  it('restores the original ornaments in Listen and returns to the same plain task in Learn', async () => {
    await drop('ornaments.musicxml', decorated());
    await learn();
    const original = playback.score;
    way.set('listen');
    expect(playback.performanceScore).toBe(original);
    expect(playback.plain).toBe(false);
    way.set('learn');
    expect(playback.plain).toBe(true);
    expect(playback.score).toBe(original);
    plan.stop();
    expect(playback.performanceScore).toBe(original);
  });
});
