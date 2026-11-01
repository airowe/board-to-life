import { describe, expect, it } from 'vitest';
import { STEP_LABELS, STEPS, stepState, type Step } from './steps';

const CASES: readonly [Step, Step, ReturnType<typeof stepState>][] = [
  ['capture', 'capture', 'current'],
  ['capture', 'check', 'todo'],
  ['capture', 'present', 'todo'],
  ['check', 'capture', 'done'],
  ['check', 'check', 'current'],
  ['check', 'present', 'todo'],
  ['present', 'capture', 'done'],
  ['present', 'check', 'done'],
  ['present', 'present', 'current'],
];

describe('stepState', () => {
  it.each(CASES)('on %s, the %s step is %s', (current, step, expected) => {
    expect(stepState(current, step)).toBe(expected);
  });
});

describe('STEPS', () => {
  it('runs from bringing in the board, through checking, to presenting', () => {
    expect(STEPS).toEqual(['capture', 'check', 'present']);
    expect(STEPS.map((step) => STEP_LABELS[step])).toEqual(['Bring in the board', 'Check the reading', 'Present']);
  });
});
