import { describe, expect, it } from 'vitest';
import { createEditQueue, samePoints } from './edits';

const point = { id: 'A', x: 10, y: 20, confidence: 0.9 };

describe('createEditQueue', () => {
  it('runs edits one after another in the order they were queued', async () => {
    const queue = createEditQueue();
    const log: string[] = [];
    const slow = (): Promise<void> =>
      new Promise((done) =>
        setTimeout(() => {
          log.push('first done');
          done();
        }, 5),
      );
    queue.add(async () => {
      log.push('first start');
      await slow();
    });
    queue.add(async () => {
      log.push('second start');
    });
    await queue.idle();
    expect(log).toEqual(['first start', 'first done', 'second start']);
  });

  it('keeps running later edits after one throws', async () => {
    const queue = createEditQueue();
    const ran: string[] = [];
    queue.add(() => Promise.reject(new Error('boom')));
    queue.add(async () => {
      ran.push('after');
    });
    await queue.idle();
    expect(ran).toEqual(['after']);
  });
});

describe('samePoints', () => {
  it('is true for equal points and false once any value differs', () => {
    expect(samePoints([point], [{ ...point }])).toBe(true);
    expect(samePoints([point], [{ ...point, x: 11 }])).toBe(false);
    expect(samePoints([point], [{ ...point, confidence: 1 }])).toBe(false);
    expect(samePoints([point], [])).toBe(false);
    expect(samePoints([point], [{ ...point, id: 'B' }])).toBe(false);
  });
});
