// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { barLoop, button, learn, plan, playback, root, settled, useApp } from './harness';

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

  it('says how long the plan is, and begins at its first step', async () => {
    expect(said()).toBe(`Plan: ${plan.steps.length} steps`);
    button(/^Start the step$/).click();
    await settled();
    expect(said()).toBe('Bars 1–4 · Right · 60%');
    expect([barLoop.enabled, barLoop.from, barLoop.to, playback.isHandEnabled('right'), playback.isHandEnabled('left'), playback.tempo]).toEqual([true, 1, 4, false, false, 0.6]);
  });

  it('counts clean passes in a row, starts again at a slip, and goes on to the next step after three', async () => {
    button(/^Start the step$/).click();
    await settled();
    // What to do is said until a pass is marked.
    expect(bar()!.querySelector('.how')?.textContent).toBe('Play it, then mark it: 3 clean in a row.');
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
    expect(said()).toBe('Next: Bars 1–4 · Right, to the left heard · 60%');
    button(/^Start the step$/).click();
    await settled();
    expect([playback.isHandEnabled('right'), playback.isHandEnabled('left')]).toEqual([false, true]);
  });

  it('closes a step by hand, or leaves it as it stands', async () => {
    button(/^Start the step$/).click();
    await settled();
    await step('Skip the step');
    await settled();
    expect(plan.doneSteps).toEqual([0]);
    button(/^Start the step$/).click();
    await settled();
    await step('Leave the step');
    await settled();
    expect([plan.current, plan.doneSteps]).toEqual([null, [0]]);
    expect(said()).toBe('Next: Bars 1–4 · Right, to the left heard · 60%');
  });

  it('lists every step under its bars, those done ticked; a press begins one', async () => {
    plan.set([0, 1]);
    bar()!.querySelector<HTMLElement>('.said')!.click();
    await settled();
    const headings = [...root.querySelectorAll('.plan .bars')].map((heading) => heading.textContent?.trim());
    expect(headings).toEqual(['Bars 1–4', 'Bars 5–8', 'Bars 1–8']);
    const part = ['Right · 60%', 'Right, to the left heard · 60%', 'Left · 60%', 'Left, to the right heard · 60%', 'Both hands · 60%', 'Up to tempo · 60–100%'];
    expect(steps().map((step) => step.textContent?.trim())).toEqual([...part, ...part, 'Joined · 100%']);
    expect(steps().slice(0, 3).map((step) => step.getAttribute('aria-label'))).toEqual(['Right · 60% · done', 'Right, to the left heard · 60% · done', null]);
    // Where one is: the next step.
    expect(steps()[2].getAttribute('aria-current')).toBe('step');
    steps()[5].click();
    await settled();
    expect(plan.current).toBe(5);
    expect(said()).toBe('Bars 1–4 · Up to tempo · 60–100%');
  });

  it('begins the plan again once one is sure', async () => {
    plan.set([0, 1, 2]);
    bar()!.querySelector<HTMLElement>('.said')!.click();
    await settled();
    button(/^Start the plan again$/).click();
    await settled();
    expect(plan.doneSteps).toEqual([0, 1, 2]);
    button(/^Again, with nothing done\?$/).click();
    await settled();
    expect(plan.doneSteps).toEqual([]);
  });

  it('says when the plan is done', async () => {
    plan.set(plan.steps.map((_, index) => index));
    await settled();
    expect(said()).toBe('The plan is done');
    expect(button(/^Start the step$/)).toBeUndefined();
  });

});
