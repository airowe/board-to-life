import { describe, expect, it } from 'vitest';
import { SWITCH_TO_CHART, WEB_VIEWS, availableViews, editHintFor, initialView } from './webViews';

const HINT = 'Tap a species to remove it.';

describe('initialView', () => {
  it.each([
    [true, 'place'],
    [false, 'chart'],
  ] as const)('with the library loaded %s opens on %s', (loaded, expected) => {
    expect(initialView(loaded)).toBe(expected);
  });
});

describe('availableViews', () => {
  it('offers every view when the library loaded', () => {
    expect(availableViews(true)).toEqual([...WEB_VIEWS]);
  });

  it('hides Place when the library did not load', () => {
    expect(availableViews(false)).toEqual(['chart', 'time']);
  });
});

describe('editHintFor', () => {
  it.each(['place', 'time'] as const)('on %s appends the switch note', (view) => {
    expect(editHintFor(view, HINT)).toBe(`${HINT} ${SWITCH_TO_CHART}`);
  });

  it('on chart returns the hint unchanged', () => {
    expect(editHintFor('chart', HINT)).toBe(HINT);
  });

  it('says where to go to change the web', () => {
    expect(SWITCH_TO_CHART).toBe('Switch to Chart to change the web.');
  });
});
