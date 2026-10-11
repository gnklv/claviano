import { describe, expect, it } from 'vitest';
import { StaffGeometry } from '../src/infrastructure/render/staff/geometry';

describe('the size of the staff', () => {
  const sized = (width: number, height: number) => {
    const geometry = new StaffGeometry();
    geometry.resize(width, height);
    return geometry;
  };
  const barsOnTape = (geometry: StaffGeometry) => (geometry.width - geometry.gutterWidth()) / geometry.barWidth();

  it('follows the height of the view, within limits', () => {
    expect(sized(1200, 240).space).toBe(10);
    expect(sized(1200, 100).space).toBe(6);
    expect(sized(1200, 900).space).toBe(14);
  });

  it('is smaller on a tall and narrow view, so that two bars and a bit are in sight', () => {
    const phone = sized(402, 545);
    expect(phone.space).toBeLessThan(10);
    expect(phone.space).toBeGreaterThan(8);
    expect(barsOnTape(phone)).toBeCloseTo(2.2);
    // Sized by the height alone it would show hardly more than a bar.
    expect((402 - phone.gutterSpaces * 14) / (16 * 14)).toBeLessThan(1.5);
  });

  it('is never smaller than can be read', () => {
    expect(sized(200, 545).space).toBe(6);
  });
});
