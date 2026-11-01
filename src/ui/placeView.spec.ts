import { describe, expect, it } from 'vitest';
import type { IndividualPose } from '../living/crowd';
import { STAGE, type Group } from '../living/layout';
import { CROSSFADE_SECONDS, LABEL_FADE_SECONDS, MAX_FADE_STEP_SECONDS, crossfadeBlend, labelAlpha, pickPlaceSpecies, skyFill, stageView } from './placeView';

describe('crossfadeBlend', () => {
  const SINCE = 10;

  it.each([
    [SINCE, 0],
    [SINCE + CROSSFADE_SECONDS / 2, 0.5],
    [SINCE + CROSSFADE_SECONDS, 1],
    [SINCE + CROSSFADE_SECONDS * 4, 1],
  ])('at %s s is %s of the way to the new picture', (seconds, expected) => {
    expect(crossfadeBlend(seconds, SINCE, false)).toBeCloseTo(expected, 6);
  });

  it('is complete at once under reduced motion', () => {
    expect(crossfadeBlend(SINCE, SINCE, true)).toBe(1);
  });
});

describe('labelAlpha', () => {
  const STEP = MAX_FADE_STEP_SECONDS / 2;

  it('fades a present label in by the time that passed', () => {
    expect(labelAlpha(0, true, STEP, false)).toBeCloseTo(STEP / LABEL_FADE_SECONDS, 6);
  });

  it('fades a dropped label out by the time that passed', () => {
    expect(labelAlpha(1, false, STEP, false)).toBeCloseTo(1 - STEP / LABEL_FADE_SECONDS, 6);
  });

  it('advances at most MAX_FADE_STEP_SECONDS however long the gap', () => {
    expect(labelAlpha(0, true, 60, false)).toBeCloseTo(MAX_FADE_STEP_SECONDS / LABEL_FADE_SECONDS, 6);
  });

  it.each([
    [true, 1],
    [false, 0],
  ])('under reduced motion a label that is present: %s jumps straight to %s', (present, expected) => {
    expect(labelAlpha(0.3, present, 0, true)).toBe(expected);
  });
});

describe('stageView', () => {
  const HEIGHT = 600;
  const EPSILON = 1e-9;

  it.each([
    ['1:1', 1],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
    ['3:1', 3],
    ['2:3', 2 / 3],
  ])('shows the whole stage, sky to floor and edge to edge, on a %s canvas', (_, aspect) => {
    const width = HEIGHT * aspect;
    const view = stageView(width, HEIGHT);
    const left = view.offsetX;
    const top = view.offsetY;
    const right = view.offsetX + STAGE.width * view.scale;
    const bottom = view.offsetY + STAGE.height * view.scale;
    expect(left).toBeGreaterThanOrEqual(-EPSILON);
    expect(top).toBeGreaterThanOrEqual(-EPSILON);
    expect(right).toBeLessThanOrEqual(width + EPSILON);
    expect(bottom).toBeLessThanOrEqual(HEIGHT + EPSILON);
    // As large as fits: one pair of edges touches the canvas. Spare width is shared either side; spare height goes
    // above the stage, so the floor sits on the canvas's bottom edge and the extra shows sky.
    expect(Math.max(right - left - width, bottom - top - HEIGHT)).toBeCloseTo(0, 6);
    expect(left).toBeCloseTo(width - right, 6);
    expect(bottom).toBeCloseTo(HEIGHT, 6);
  });
});

describe('skyFill', () => {
  const HEIGHT = 600;

  it.each([
    ['1:1', 1],
    ['2:3', 2 / 3],
    ['5:4', 5 / 4],
  ])('on a %s canvas fills the room above the stage, from the canvas top down to the stage top, edge to edge', (_, aspect) => {
    const view = stageView(HEIGHT * aspect, HEIGHT);
    const fill = skyFill(view);
    if (!fill) throw new Error('expected room above the stage');
    expect(fill.y + fill.height).toBeCloseTo(0, 6);
    expect(view.offsetY + fill.y * view.scale).toBeCloseTo(0, 6);
    expect(fill).toMatchObject({ x: 0, width: STAGE.width });
  });

  it.each([
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
  ])('on a %s canvas has nothing to fill', (_, aspect) => {
    expect(skyFill(stageView(HEIGHT * aspect, HEIGHT))).toBeNull();
  });
});

describe('pickPlaceSpecies', () => {
  const SIZE = 100;
  const group = (speciesId: string, zone: Group['zone'] = 'floor'): Group => ({ speciesId, zone, role: 'consumer', size: SIZE, centreX: 0, baseY: 0, depth: 0 }) as unknown as Group;
  const pose = (x: number, y: number, alpha = 1): IndividualPose => ({ x, y, scale: 1, alpha, facing: 1, moving: false, rotation: 0 });
  const groups = [group('fox'), group('hawk', 'sky')];
  const poses = new Map([
    ['fox', [pose(200, 500)]],
    ['hawk', [pose(600, 200)]],
  ]);
  const NO_REACH = 0;

  it('finds the animal under the point', () => {
    expect(pickPlaceSpecies(groups, poses, 'grassland', { x: 200, y: 450 }, NO_REACH)).toBe('fox');
    expect(pickPlaceSpecies(groups, poses, 'grassland', { x: 600, y: 200 }, NO_REACH)).toBe('hawk');
  });

  it('finds nothing on empty ground', () => {
    expect(pickPlaceSpecies(groups, poses, 'grassland', { x: 900, y: 700 }, NO_REACH)).toBeNull();
  });

  it('reaches a little past the picture for a fingertip', () => {
    const justOutside = { x: 200 + SIZE, y: 450 };
    expect(pickPlaceSpecies(groups, poses, 'grassland', justOutside, NO_REACH)).toBeNull();
    expect(pickPlaceSpecies(groups, poses, 'grassland', justOutside, SIZE)).toBe('fox');
  });

  it('ignores an animal that has faded out', () => {
    const faded = new Map([['fox', [pose(200, 500, 0)]]]);
    expect(pickPlaceSpecies(groups, faded, 'grassland', { x: 200, y: 450 }, NO_REACH)).toBeNull();
  });

  it('picks the nearest of two overlapping animals', () => {
    const close = new Map([
      ['fox', [pose(200, 500)]],
      ['hawk', [pose(240, 500)]],
    ]);
    expect(pickPlaceSpecies(groups.map((each) => ({ ...each, zone: 'floor' as const })), close, 'grassland', { x: 235, y: 450 }, NO_REACH)).toBe('hawk');
  });
});
