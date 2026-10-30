import { describe, expect, it } from 'vitest';
import { backingSize, toDrawing, viewOf } from './view';

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

describe('backingSize', () => {
  it.each([
    ['a phone at 3x', { width: 343, height: 402.5 }, 3],
    ['a laptop at 2x', { width: 912.4, height: 610 }, 2],
    ['a board at 1.25x', { width: 1919, height: 1003 }, 1.25],
  ])('keeps the pixel grid uniform on %s', (_label, box, ratio) => {
    const backing = backingSize(box, ratio);
    expect(Number.isInteger(backing.width)).toBe(true);
    expect(Number.isInteger(backing.height)).toBe(true);
    expect(Math.abs(backing.width / box.width - ratio)).toBeLessThan(1 / box.width);
    expect(Math.abs(backing.height / box.height - ratio)).toBeLessThan(1 / box.height);
  });

  it('never drops to zero pixels for an empty box', () => {
    expect(backingSize({ width: 0, height: 0 }, 2)).toEqual({ width: 1, height: 1 });
  });
});
