import { describe, expect, it } from 'vitest';
import { createRedrawGate } from './redraw';

const FRAMES = 5;

const drawsOver = (gate: ReturnType<typeof createRedrawGate>, animating: boolean): number =>
  Array.from({ length: FRAMES }, () => gate.shouldDraw(animating)).filter(Boolean).length;

describe('createRedrawGate', () => {
  it('draws the first frame', () => {
    expect(createRedrawGate().shouldDraw(false)).toBe(true);
  });

  it('draws every frame while the scene is moving', () => {
    const gate = createRedrawGate();
    expect(drawsOver(gate, true)).toBe(FRAMES);
  });

  it('stops drawing once the scene is still', () => {
    const gate = createRedrawGate();
    gate.shouldDraw(true);
    expect(drawsOver(gate, false)).toBe(1);
  });

  it('draws once more after being invalidated, for example by a resize', () => {
    const gate = createRedrawGate();
    drawsOver(gate, false);
    gate.invalidate();
    expect(drawsOver(gate, false)).toBe(1);
  });
});
