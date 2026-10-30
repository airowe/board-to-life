import { describe, expect, it } from 'vitest';
import { createTrailRecorder } from './trails';

const GAP = 5;
const TRAVEL = 20;

const at = (x: number, y: number) => [
  { id: 'ball', x, y, angle: 0 },
  { id: 'floor', x: 600, y: 770, angle: 0 },
];

describe('createTrailRecorder', () => {
  it('keeps a point only once a body has moved a gap away from the last one', () => {
    const recorder = createTrailRecorder(GAP);
    for (const x of [0, 2, 4, 6, 8, 12, 30]) recorder.record(at(x, 0));
    expect(recorder.trails(0).find((trail) => trail.id === 'ball')?.points.map((point) => point.x)).toEqual([0, 6, 12, 30]);
  });

  it('always ends a trail where the body came to rest', () => {
    const recorder = createTrailRecorder(GAP);
    for (const x of [0, 10, 12]) recorder.record(at(x, 0));
    expect(recorder.trails(0).find((trail) => trail.id === 'ball')?.points.at(-1)).toEqual({ x: 12, y: 0 });
  });

  it('leaves out bodies that hardly moved, such as the floor', () => {
    const recorder = createTrailRecorder(GAP);
    for (const x of [0, 40, 80]) recorder.record(at(x, 0));
    expect(recorder.trails(TRAVEL).map((trail) => trail.id)).toEqual(['ball']);
  });

  it('has no trails before anything is recorded', () => {
    expect(createTrailRecorder(GAP).trails(0)).toEqual([]);
  });
});
