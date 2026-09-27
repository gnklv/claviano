import { describe, expect, it } from 'vitest';
import { performanceOrder, type BarNavigation } from '../src/domain/notation/navigation';

const plain = (count: number): BarNavigation[] => Array.from({ length: count }, () => ({}));

describe('performanceOrder', () => {
  it('plays a score without navigation straight through', () => {
    expect(performanceOrder(plain(4))).toEqual([0, 1, 2, 3]);
  });

  it('repeats a passage between ‖: and :‖', () => {
    const bars = plain(5);
    bars[1] = { repeatStart: true };
    bars[2] = { repeatEnd: { times: 2 } };
    expect(performanceOrder(bars)).toEqual([0, 1, 2, 1, 2, 3, 4]);
  });

  it('goes back to the beginning when there is no ‖:', () => {
    const bars = plain(3);
    bars[1] = { repeatEnd: { times: 2 } };
    expect(performanceOrder(bars)).toEqual([0, 1, 0, 1, 2]);
  });

  it('plays the first ending, then the second', () => {
    // ‖: 0 1 |1. 2 :‖ |2. 3 | 4
    const bars: BarNavigation[] = [{ repeatStart: true }, {}, { ending: [1], repeatEnd: { times: 2 } }, { ending: [2] }, {}];
    expect(performanceOrder(bars)).toEqual([0, 1, 2, 0, 1, 3, 4]);
  });

  it('repeats as many times as the sign says', () => {
    const bars: BarNavigation[] = [{ repeatStart: true }, { repeatEnd: { times: 3 } }, {}];
    expect(performanceOrder(bars)).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  it('handles two repeated passages one after the other', () => {
    const bars: BarNavigation[] = [{ repeatStart: true }, { repeatEnd: { times: 2 } }, { repeatStart: true }, { repeatEnd: { times: 2 } }];
    expect(performanceOrder(bars)).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
  });

  it('D.C. al Fine: back to the start without repeats, stop at Fine', () => {
    // ‖: 0 :‖ 1 Fine | 2 D.C.
    const bars: BarNavigation[] = [{ repeatStart: true, repeatEnd: { times: 2 } }, { fine: true }, { jump: 'dacapo' }];
    expect(performanceOrder(bars)).toEqual([0, 0, 1, 2, 0, 1]);
  });

  it('D.S. al Coda: back to the segno, then from To Coda to the coda', () => {
    // 0 | 𝄋 1 | 2 To Coda | 3 D.S. | 𝄌 4
    const bars: BarNavigation[] = [{}, { segno: true }, { toCoda: true }, { jump: 'dalsegno' }, { coda: true }];
    expect(performanceOrder(bars)).toEqual([0, 1, 2, 3, 1, 2, 4]);
  });

  it('after a jump, plays only the last ending', () => {
    // 𝄋 ‖: 0 |1. 1 :‖ |2. 2 | 3 D.S. al Fine … with Fine at 2
    const bars: BarNavigation[] = [
      { segno: true, repeatStart: true },
      { ending: [1], repeatEnd: { times: 2 } },
      { ending: [2], fine: true },
      { jump: 'dalsegno' },
    ];
    expect(performanceOrder(bars)).toEqual([0, 1, 0, 2, 3, 0, 2]);
  });

  it('ignores Fine and To Coda before the jump', () => {
    const bars: BarNavigation[] = [{ fine: true }, { toCoda: true }, {}, { coda: true }];
    expect(performanceOrder(bars)).toEqual([0, 1, 2, 3]);
  });

  it('never loops forever on a broken score', () => {
    const bars: BarNavigation[] = [{ repeatStart: true, repeatEnd: { times: 1000 } }];
    expect(performanceOrder(bars).length).toBeLessThanOrEqual(16);
  });
});
