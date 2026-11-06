// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attributes, note, score } from '../musicXmlScore';
import { button, drop, learn, plan, playback, root, settled, useApp, way } from './harness';

useApp();

const study = (chords = false) => new TextDecoder().decode(score(`<measure number="1">${attributes(2, 0, 2)}
  ${note('D', 5, 4, { extra: '<voice>1</voice>' })}
  ${chords ? note('F', 4, 4, { extra: '<voice>1</voice><chord/>' }) + note('A', 4, 4, { extra: '<voice>1</voice><chord/>' }) : ''}
  <backup><duration>4</duration></backup>
  ${note('D', 3, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('F', 3, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('A', 3, 1, { staff: 2, extra: '<voice>5</voice><chord/>' })}
  ${note('D', 4, 1, { staff: 2, extra: '<voice>5</voice><chord/>' })}
  ${note('A', 2, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('F', 3, 1, { staff: 2, extra: '<voice>5</voice>' })}
  ${note('A', 3, 1, { staff: 2, extra: '<voice>5</voice><chord/>' })}
  ${note('D', 4, 1, { staff: 2, extra: '<voice>5</voice><chord/>' })}</measure>`));

describe('learning a piece a little at a time', () => {
  it('begins with the highlighted notes on entering Learn, without asking for a layer or voice', async () => {
    await drop('study.musicxml', study());
    const original = playback.score;
    await learn();
    expect(plan.current).toBe(0);
    expect(root.querySelector('.step-bar')?.textContent).toContain('Play the highlighted notes');
    expect(button(/^Start the step$/)).toBeUndefined();
    expect(playback.noteSelection).toHaveLength(1);
    expect(playback.score).toBe(original);
    expect(root.textContent).not.toMatch(/heuristic|candidate|choose a voice|layer selection/i);
  });

  it('adds bass after successful passes and then moves to the full fragment without more setup', async () => {
    await drop('study.musicxml', study());
    await learn();
    for (let pass = 0; pass < 3; pass++) button(/^Clean$/).click();
    await settled();
    expect(root.querySelector('.step-bar')?.textContent).toContain('Add the bass');
    expect(playback.noteSelection).toHaveLength(3);
    expect(playback.playing).toBe(false);
    for (let pass = 0; pass < 3; pass++) button(/^Clean$/).click();
    await settled();
    expect(playback.noteSelection).toBeNull();
    expect(plan.current).toBe(2);
    expect(playback.playing).toBe(false);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
  });

  it('hears the whole piece in Listen and resumes learning with its next unfinished task', async () => {
    await drop('study.musicxml', study());
    await learn();
    const original = playback.score;
    way.set('listen');
    await settled();
    expect(playback.noteSelection).toBeNull();
    expect(root.querySelector('.step-bar')).toBeNull();
    await learn();
    expect(plan.current).toBe(0);
    expect(playback.noteSelection).toHaveLength(1);
    expect(playback.score).toBe(original);
  });

  it('adds the rest of the leading hand before the full accompaniment when there is more to learn', async () => {
    await drop('chords.musicxml', study(true));
    await learn();
    const original = playback.score;
    for (let pass = 0; pass < 6; pass++) button(/^Clean$/).click();
    await settled();
    expect(root.querySelector('.step-bar')?.textContent).toContain('Add the rest of the right hand');
    expect(playback.noteSelection).toHaveLength(5);
    expect(playback.score).toBe(original);
    expect(playback.playing).toBe(false);
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
    for (let pass = 0; pass < 3; pass++) button(/^Clean$/).click();
    await settled();
    expect(root.querySelector('.step-bar')?.textContent).toContain('Both hands');
    expect(playback.noteSelection).toBeNull();
  });
});
