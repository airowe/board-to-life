import { describe, expect, it } from 'vitest';
import { cartWheels } from './cart';

const CART = { x: 500, y: 300, width: 120, height: 50, wheelRadius: 18 };

describe('cartWheels', () => {
  it('puts a wheel on each bottom corner, inside the body by one radius', () => {
    expect(cartWheels({ ...CART, angle: 0 })).toEqual([
      { x: 500 - 60 + 18, y: 325 },
      { x: 500 + 60 - 18, y: 325 },
    ]);
  });

  it('turns the wheels with a tilted cart', () => {
    const [back, front] = cartWheels({ ...CART, angle: Math.PI / 2 });
    expect(back?.x).toBeCloseTo(500 - 25, 9);
    expect(back?.y).toBeCloseTo(300 - 42, 9);
    expect(front?.x).toBeCloseTo(500 - 25, 9);
    expect(front?.y).toBeCloseTo(300 + 42, 9);
  });
});
