// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { barLoop, button, learn, plan, playback, root, screen, settled, turnIntoPhone, useApp } from './harness';

/* The plan on the piece's screen: the step being played over the transport, and the list of every step. */

useApp();

describe('the plan for learning a piece', () => {
  const bar = () => root.querySelector<HTMLElement>('.step-bar');
  const said = () => bar()?.querySelector('.said')?.textContent?.trim();
  const dots = () => bar()!.querySelectorAll('.dots .made').length;
  const steps = () => [...root.querySelectorAll<HTMLElement>('.plan .step')];
  /** Something done with the step being played, from behind its "⋯". */
  const step = async (choice: string) => {
    bar()!.querySelector<HTMLElement>('.more button')!.click();
    await settled();
    [...bar()!.querySelectorAll<HTMLElement>('[role=menuitem]')].find((item) => item.textContent?.trim() === choice)!.click();
  };

  beforeEach(async () => {
    button(/Ode to Joy/).click();
    await settled();
    await learn();
  });

  it('begins with a ready task as soon as Learn is selected', () => {
    expect(said()).toBe('Bars 1–4 · Play the highlighted notes · 60%');
    expect(button(/^Start the step$/)).toBeUndefined();
    expect([barLoop.enabled, barLoop.from, barLoop.to, playback.isHandEnabled('right'), playback.isHandEnabled('left'), playback.tempo]).toEqual([true, 1, 4, true, true, 0.6]);
  });

  it('counts clean passes in a row, starts again at a slip, and goes on to the next step after three', async () => {
    // What to do is said until a pass is marked.
    expect(bar()!.querySelector('.how')?.textContent).toBe('Listen, then play. Aim for 3 clean passes.');
    button(/^Clean$/).click();
    button(/^Clean$/).click();
    await settled();
    expect(dots()).toBe(2);
    expect(bar()!.querySelector('.how')).toBeNull();
    button(/^A slip$/).click();
    await settled();
    expect(dots()).toBe(0);
    for (let pass = 0; pass < 3; pass++) button(/^Clean$/).click();
    await settled();
    expect(said()).toBe('Bars 1–4 · Add the bass · 60%');
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([true, true]);
    expect(playback.noteSelection).not.toBeNull();
  });

  it('closes a step by hand, or leaves it as it stands', async () => {
    await step('Skip the step');
    await settled();
    expect(plan.doneSteps).toEqual([0]);
    expect(plan.current).toBe(1);
    await step('Leave the step');
    await settled();
    expect([plan.current, plan.doneSteps]).toEqual([null, [0]]);
    expect(said()).toBe('Next: Bars 1–4 · Add the bass · 60%');
  });

  it('lists every step under its bars, those done ticked; a press begins one', async () => {
    plan.set([0, 1]);
    bar()!.querySelector<HTMLElement>('.said')!.click();
    await settled();
    const headings = [...root.querySelectorAll('.plan .bars')].map((heading) => heading.textContent?.trim());
    expect(headings).toEqual(['Bars 1–4', 'Bars 5–8', 'Bars 1–8']);
    const part = ['Play the highlighted notes · 60%', 'Add the bass · 60%', 'Both hands · 60%', 'Up to tempo · 60–100%'];
    expect(steps().map((step) => step.textContent?.trim())).toEqual([...part, ...part, 'Joined · 100%']);
    expect(steps().slice(0, 3).map((step) => step.getAttribute('aria-label'))).toEqual(['Play the highlighted notes · 60% · done', 'Add the bass · 60% · done', null]);
    // Where one is: the next step.
    expect(steps()[2].getAttribute('aria-current')).toBe('step');
    steps()[3].click();
    await settled();
    expect(plan.current).toBe(3);
    expect(said()).toBe('Bars 1–4 · Up to tempo · 60–100%');
  });

  it('begins the plan again once one is sure', async () => {
    plan.set([0, 1, 2]);
    plan.start(4);
    await settled();
    bar()!.querySelector<HTMLElement>('.said')!.click();
    await settled();
    button(/^Start the plan again$/).click();
    await settled();
    expect(plan.doneSteps).toEqual([0, 1, 2]);
    button(/^Again, with nothing done\?$/).click();
    await settled();
    expect(plan.doneSteps).toEqual([]);
    expect(plan.current).toBe(0);
    expect([barLoop.from, barLoop.to]).toEqual([1, 4]);
    expect(playback.playing).toBe(false);
    expect(root.querySelector('dialog[open]')).toBeNull();
  });

  it('says when the plan is done', async () => {
    plan.set(plan.steps.map((_, index) => index));
    await settled();
    expect(said()).toBe('The plan is done');
    expect(button(/^Start the step$/)).toBeUndefined();
  });

  it('explains that clean repeats for tempo work are counted at the target tempo', async () => {
    plan.start(plan.steps.findIndex((step) => step.kind === 'up'));
    await settled();
    expect(bar()!.querySelector('.how')?.textContent).toBe('Play 3 clean passes in a row at 100% tempo.');
    button(/^Clean$/).click();
    await settled();
    expect(bar()!.querySelector('.how')?.textContent).toBe('Play 3 clean passes in a row at 100% tempo.');
  });

  it('shows the instruction again when the current task is chosen afresh', async () => {
    button(/^Clean$/).click();
    await settled();
    expect(bar()!.querySelector('.how')).toBeNull();
    bar()!.querySelector<HTMLElement>('.said')!.click();
    await settled();
    steps()[0].click();
    await settled();
    expect(bar()!.querySelector('.how')?.textContent).toBe('Listen, then play. Aim for 3 clean passes.');
    expect(dots()).toBe(0);
    expect(root.querySelector('dialog[open]')).toBeNull();
  });


  describe('on a phone held upright', () => {
    beforeEach(turnIntoPhone);

    it('shows the first task directly, without opening the practice sheet', () => {
      expect(plan.current).toBe(0);
      expect(bar()).not.toBeNull();
      expect(button(/^Start the step$/)).toBeUndefined();
      expect(root.querySelector('dialog[open]')).toBeNull();
    });

    it('says what to do in the place of the step’s name, until a pass is marked', async () => {
      plan.start(0);
      await settled();
      expect(bar()!.querySelector('.how.in-place')?.textContent).toBe('Play the highlighted notes · 60%');
      expect(bar()!.querySelector('.said')).toBeNull();
      button(/^Clean$/).click();
      await settled();
      expect(bar()!.querySelector('.how')).toBeNull();
      expect(said()).toBe('Bars 1–4 · Play the highlighted notes · 60%');
    });
  });

  describe('on a phone on its side', () => {
    beforeEach(async () => {
      screen.short = true;
      screen.listeners.forEach((listener) => listener());
      await nextTick();
    });

    it('shows the ready task on its side as well', () => {
      expect(plan.current).toBe(0);
      expect(root.querySelector('dialog[open]')).toBeNull();
      // The step played: the bar, its name in it (not what to do in its place, as upright).
      expect(said()).toBe('Bars 1–4 · Play the highlighted notes · 60%');
      expect(bar()!.querySelector('.how.in-place')).toBeNull();
    });
  });
});
