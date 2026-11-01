import { describe, expect, it } from 'vitest';
import { createRateLimit } from './rateLimit';

const WINDOW_MS = 1000;
const limits = { perVisitor: 2, overall: 3, windowMs: WINDOW_MS };

const clockAt = (start = 0): { now: () => number; set: (time: number) => void } => {
  let time = start;
  return { now: () => time, set: (next) => void (time = next) };
};

describe('createRateLimit', () => {
  it('allows a visitor up to their limit, then refuses', () => {
    const allow = createRateLimit(limits, clockAt().now);
    expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false]);
  });

  it('counts each visitor apart', () => {
    const allow = createRateLimit(limits, clockAt().now);
    expect([allow('a'), allow('a'), allow('b')]).toEqual([true, true, true]);
  });

  it('refuses everyone once the overall limit is reached, so many visitors cannot add up to a large bill', () => {
    const allow = createRateLimit(limits, clockAt().now);
    expect([allow('a'), allow('b'), allow('c'), allow('d')]).toEqual([true, true, true, false]);
  });

  it('does not count a refused call against the overall limit', () => {
    const allow = createRateLimit(limits, clockAt().now);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
  });

  it('starts again in the next window', () => {
    const clock = clockAt();
    const allow = createRateLimit(limits, clock.now);
    allow('a');
    allow('a');
    clock.set(WINDOW_MS);
    expect(allow('a')).toBe(true);
  });
});
