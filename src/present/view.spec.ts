import { describe, expect, it } from 'vitest';
import { toDrawing, viewOf } from './view';

const DRAWING = { width: 1200, height: 800 };

describe('viewOf', () => {
  it.each([
    { name: 'a wide screen, centred across', screen: { width: 2400, height: 1000 }, view: { scale: 1.25, offsetX: 450, offsetY: 0 } },
    { name: 'a tall screen, centred down', screen: { width: 600, height: 1000 }, view: { scale: 0.5, offsetX: 0, offsetY: 300 } },
    { name: 'an exact fit', screen: { width: 1200, height: 800 }, view: { scale: 1, offsetX: 0, offsetY: 0 } },
  ])('fits the drawing on $name', ({ screen, view }) => {
    expect(viewOf(screen, DRAWING)).toEqual(view);
  });
});

describe('toDrawing', () => {
  it('turns a point on screen back into drawing units', () => {
    const view = viewOf({ width: 2400, height: 1000 }, DRAWING);
    expect(toDrawing(view, { x: 450 + 125, y: 250 })).toEqual({ x: 100, y: 200 });
  });
});
