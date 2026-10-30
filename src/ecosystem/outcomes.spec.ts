import { describe, expect, it } from 'vitest';
import { CHANGE_THRESHOLD, EXTINCT_FRACTION, directionsAfter } from './outcomes';
import type { Series } from './model';

const STEPS = 400;
const EVENT_STEP = 100;
const BASE = 100;
const TAIL = 100;

const flatThenFinal = (final: number): number[] => Array.from({ length: STEPS + 1 }, (_, step) => (step < EVENT_STEP ? BASE : step > STEPS - TAIL ? final : BASE));

const seriesOf = (values: number[]): Series => ({ ids: ['x'], values: { x: values } });

describe('directionsAfter', () => {
  it.each([
    ['inside the band above', BASE * (1 + CHANGE_THRESHOLD * 0.9), 'steady'],
    ['inside the band below', BASE * (1 - CHANGE_THRESHOLD * 0.9), 'steady'],
    ['just above the band', BASE * (1 + CHANGE_THRESHOLD * 1.1), 'rose'],
    ['just below the band', BASE * (1 - CHANGE_THRESHOLD * 1.1), 'fell'],
    ['just above the extinct fraction', BASE * EXTINCT_FRACTION * 1.5, 'fell'],
    ['just under the extinct fraction', BASE * EXTINCT_FRACTION * 0.5, 'died out'],
    ['zero', 0, 'died out'],
  ])('calls a final level %s %s', (_name, final, expected) => {
    expect(directionsAfter(seriesOf(flatThenFinal(final)), EVENT_STEP).x).toBe(expected);
  });

  it('judges the mean of the last 100 steps, not the last value', () => {
    const values = flatThenFinal(BASE * 2);
    values[STEPS] = BASE;
    expect(directionsAfter(seriesOf(values), EVENT_STEP).x).toBe('rose');
  });

  it('compares with the value at the event step', () => {
    const values = flatThenFinal(BASE);
    for (let step = 0; step < EVENT_STEP; step += 1) values[step] = BASE * 10;
    expect(directionsAfter(seriesOf(values), EVENT_STEP).x).toBe('steady');
  });

  it('calls a species removed at the event step died out', () => {
    const values = Array.from({ length: STEPS + 1 }, (_, step) => (step < EVENT_STEP ? BASE : 0));
    expect(directionsAfter(seriesOf(values), EVENT_STEP).x).toBe('died out');
  });

  it('calls a species that was never there steady', () => {
    expect(directionsAfter(seriesOf(Array(STEPS + 1).fill(0)), EVENT_STEP).x).toBe('steady');
  });

  it('returns one direction per species', () => {
    const series: Series = { ids: ['a', 'b'], values: { a: flatThenFinal(BASE), b: flatThenFinal(0) } };
    expect(directionsAfter(series, EVENT_STEP)).toEqual({ a: 'steady', b: 'died out' });
  });
});
