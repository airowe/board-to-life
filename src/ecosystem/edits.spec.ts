import { describe, expect, it } from 'vitest';
import type { View } from '../present/view';
import { editOnRelease, emptyEdits, pickSpecies, setStart, startMax, toggleRemoved } from './edits';
import { grasslandWeb, speciesAt, webOf } from './fixtures';
import type { Species } from './schema';
import { startingPopulations } from './model';

const START_MAX_FACTOR = 4;
const MID_START = 7;

describe('toggleRemoved', () => {
  it('adds a species and removes it again without mutating the earlier edits', () => {
    const none = emptyEdits();
    const withFox = toggleRemoved(none, 'fox');
    expect([...withFox.removed]).toEqual(['fox']);
    expect(none.removed.size).toBe(0);
    expect(toggleRemoved(withFox, 'fox').removed.size).toBe(0);
  });
});

describe('startMax', () => {
  it('is four times the steady start of that species', () => {
    const web = grasslandWeb();
    const steady = startingPopulations(web);
    for (const { id } of web.species) expect(startMax(web, id)).toBeCloseTo(START_MAX_FACTOR * (steady[id] as number), 6);
  });

  it('is zero for a species that is not in the web', () => {
    expect(startMax(grasslandWeb(), 'dragon')).toBe(0);
  });
});

describe('setStart', () => {
  const max = 100;

  it.each([
    ['inside the range', MID_START, MID_START],
    ['below zero', -5, 0],
    ['above the maximum', max * 3, max],
    ['not a number', Number.NaN, 0],
  ])('stores a value %s as %d', (_label, value, stored) => {
    expect(setStart(emptyEdits(), 'rabbit', value, max).start).toEqual({ rabbit: stored });
  });

  it('keeps other species and does not mutate the earlier edits', () => {
    const first = setStart(emptyEdits(), 'rabbit', MID_START, max);
    const second = setStart(first, 'fox', 2, max);
    expect(second.start).toEqual({ rabbit: MID_START, fox: 2 });
    expect(first.start).toEqual({ rabbit: MID_START });
  });
});

describe('pickSpecies', () => {
  const reachPx = 32;
  const halfScale: View = { scale: 0.5, offsetX: 20, offsetY: 10 };
  const toScreen = (view: View, x: number, y: number): { x: number; y: number } => ({ x: view.offsetX + x * view.scale, y: view.offsetY + y * view.scale });
  const rabbit = grasslandWeb().species.find((entry) => entry.id === 'rabbit') as Species;
  const reachInDrawing = reachPx / halfScale.scale;

  it.each([
    ['the centre of the box', rabbit.x, rabbit.y],
    ['inside the box near its corner', rabbit.x + rabbit.width / 2 - 1, rabbit.y - rabbit.height / 2 + 1],
    ['just within reach of its right edge', rabbit.x + rabbit.width / 2 + reachInDrawing - 1, rabbit.y],
  ])('hits a species at %s', (_label, x, y) => {
    expect(pickSpecies(grasslandWeb(), halfScale, toScreen(halfScale, x, y), reachPx)).toBe('rabbit');
  });

  it('misses a point just beyond reach of every box', () => {
    const outside = toScreen(halfScale, rabbit.x + rabbit.width / 2 + reachInDrawing + 1, rabbit.y);
    expect(pickSpecies(grasslandWeb(), halfScale, outside, reachPx)).toBeNull();
  });

  it('picks the nearer species when two are within reach', () => {
    const [left, right] = [speciesAt('grass', 'producer', 100, 100), speciesAt('rabbit', 'consumer', 200, 100)];
    const web = webOf([left, right], []);
    const justOutsideRabbit = 2;
    const nearRabbit = toScreen(halfScale, right.x - right.width / 2 - justOutsideRabbit, right.y);
    expect(pickSpecies(web, halfScale, nearRabbit, reachPx)).toBe('rabbit');
  });
});

describe('editOnRelease', () => {
  const max = 100;
  const pressOn = (id: string, moved: boolean) => ({ id, moved, value: MID_START, max });
  const removedRabbit = toggleRemoved(emptyEdits(), 'rabbit');

  it.each([
    ['present', emptyEdits(), ['rabbit']],
    ['removed', removedRabbit, []],
  ])('a tap on a %s species toggles its removal', (_label, edits, removedAfter) => {
    expect([...(editOnRelease(edits, pressOn('rabbit', false))?.removed ?? ['unchanged'])]).toEqual(removedAfter);
  });

  it('a drag on a removed species changes nothing', () => {
    expect(editOnRelease(removedRabbit, pressOn('rabbit', true))).toBeNull();
  });

  it('a drag on a present species sets its start and leaves removals alone', () => {
    const after = editOnRelease(emptyEdits(), pressOn('rabbit', true));
    expect(after?.start).toEqual({ rabbit: MID_START });
    expect(after?.removed.size).toBe(0);
  });

  it('a drag stores the start clamped to the maximum', () => {
    expect(editOnRelease(emptyEdits(), { id: 'rabbit', moved: true, value: max * 2, max })?.start).toEqual({ rabbit: max });
  });
});
