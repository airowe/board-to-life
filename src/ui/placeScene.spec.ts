import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyEdits, type WebEdits } from '../ecosystem/edits';
import { speciesAt, webOf } from '../ecosystem/fixtures';
import type { Series } from '../ecosystem/model';
import type { LivePictures } from '../library/live';
import { parseLibrary } from '../library/manifest';
import { BASE_ANIMALS, BASE_PRODUCERS, type CrowdTracker, type UpdateOptions } from '../living/crowd';
import { SETTLE_SECONDS, VIGOUR_EPSILON, VIGOUR_RESEND_SECONDS, createPlaceScene } from './placeScene';

const library = parseLibrary(JSON.parse(readFileSync('public/library/manifest.json', 'utf8')));
const web = webOf([speciesAt('grass', 'producer', 100, 800), speciesAt('rabbit', 'consumer', 400, 800)], [], { kind: 'drought' });
const SETTLED = { grass: 1000, rabbit: 100 };
const START = 50;
const TICK = 0.01;
// Grass at this level keeps its count (round(6 × 0.95) = 6) but its height has moved by more than VIGOUR_EPSILON.
const THINNER_GRASS = SETTLED.grass * 0.95;
const BARELY_THINNER_GRASS = SETTLED.grass * (1 - VIGOUR_EPSILON / 2);

type Sent = { targets: Record<string, number>; seconds: number; options: UpdateOptions | undefined };

const seriesOf = (grass: number[], rabbit: number[]): Series => ({ ids: ['grass', 'rabbit'], values: { grass, rabbit } });
const flat = seriesOf([SETTLED.grass, SETTLED.grass, SETTLED.grass], [SETTLED.rabbit, SETTLED.rabbit, SETTLED.rabbit]);

const setUp = (onChange: () => void = () => undefined) => {
  const sent: Sent[] = [];
  const tracker: CrowdTracker = {
    update: (targets, seconds, options) => void sent.push({ targets: { ...targets }, seconds, options }),
    poses: () => new Map(),
  };
  let listener: (() => void) | null = null;
  const live: LivePictures = {
    request: () => undefined,
    state: () => 'none',
    image: () => null,
    onChange: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
  const clock = { now: START };
  const scene = createPlaceScene(web, SETTLED, () => new Map(), { library, fallback: [], live }, onChange, { tracker, now: () => clock.now });
  return { scene, sent, clock, fire: () => listener?.(), listening: () => listener !== null };
};

const follow = (scene: ReturnType<typeof setUp>['scene'], series: Series, step: number, seconds: number, edits: WebEdits = emptyEdits()) =>
  scene.follow(series, step, edits, seconds);

afterEach(() => vi.restoreAllMocks());

describe('createPlaceScene: telling the crowd', () => {
  it('settles the first update, with the opening counts and heights', () => {
    const { scene, sent } = setUp();
    follow(scene, flat, 0, START);
    expect(sent).toEqual([{ targets: { grass: BASE_PRODUCERS, rabbit: BASE_ANIMALS }, seconds: START, options: { settle: true, vigour: { grass: 1 } } }]);
  });

  it('tells the crowd nothing while nothing changes', () => {
    const { scene, sent } = setUp();
    const edits = emptyEdits();
    follow(scene, flat, 0, START, edits);
    follow(scene, flat, 0, START + VIGOUR_RESEND_SECONDS * 4, edits);
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for a step that keeps the counts and barely moves a height', () => {
    const { scene, sent } = setUp();
    const series = seriesOf([SETTLED.grass, BARELY_THINNER_GRASS], [SETTLED.rabbit, SETTLED.rabbit]);
    follow(scene, series, 0, START);
    follow(scene, series, 1, START + VIGOUR_RESEND_SECONDS * 2);
    expect(sent).toHaveLength(1);
  });

  it('sends a change of count at once, without settling', () => {
    const { scene, sent } = setUp();
    const series = seriesOf([SETTLED.grass, SETTLED.grass], [SETTLED.rabbit, SETTLED.rabbit * 2]);
    follow(scene, series, 0, START);
    follow(scene, series, 1, START + TICK);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ targets: { rabbit: 2 * BASE_ANIMALS }, seconds: START + TICK, options: { settle: false } });
  });

  it('does not settle a replay with edits, so the change is seen happening', () => {
    const { scene, sent } = setUp();
    follow(scene, flat, 2, START);
    const replayed = seriesOf([SETTLED.grass], [0]);
    follow(scene, replayed, 0, START + 1, { ...emptyEdits(), removed: new Set(['rabbit']) });
    expect(sent[1]).toMatchObject({ targets: { rabbit: 0 }, options: { settle: false } });
  });

  it('holds back a height change until VIGOUR_RESEND_SECONDS have passed, then sends it even when playback has stopped', () => {
    const { scene, sent } = setUp();
    const series = seriesOf([SETTLED.grass, THINNER_GRASS], [SETTLED.rabbit, SETTLED.rabbit]);
    follow(scene, series, 0, START);
    follow(scene, series, 1, START + TICK);
    expect(sent).toHaveLength(1);
    follow(scene, series, 1, START + VIGOUR_RESEND_SECONDS);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      targets: { grass: BASE_PRODUCERS, rabbit: BASE_ANIMALS },
      seconds: START + VIGOUR_RESEND_SECONDS,
      options: { settle: false, vigour: { grass: THINNER_GRASS / SETTLED.grass } },
    });
    follow(scene, series, 1, START + VIGOUR_RESEND_SECONDS * 3);
    expect(sent).toHaveLength(2);
  });
});

describe('createPlaceScene: busy', () => {
  it('is busy for SETTLE_SECONDS after the playback moves', () => {
    const { scene } = setUp();
    follow(scene, flat, 0, START);
    expect(scene.busy(START + SETTLE_SECONDS - TICK)).toBe(true);
    expect(scene.busy(START + SETTLE_SECONDS + TICK)).toBe(false);
  });

  it('wakes on the shared clock when a live picture arrives long after the last draw', () => {
    const onChange = vi.fn();
    const { scene, clock, fire } = setUp(onChange);
    follow(scene, flat, 0, START);
    clock.now = START + SETTLE_SECONDS * 10;
    expect(scene.busy(clock.now)).toBe(false);
    fire();
    expect(onChange).toHaveBeenCalledOnce();
    expect(scene.busy(clock.now)).toBe(true);
  });

  it('wake() marks the scene busy from now', () => {
    const { scene, clock } = setUp();
    clock.now = START + SETTLE_SECONDS * 10;
    scene.wake();
    expect(scene.busy(clock.now + SETTLE_SECONDS - TICK)).toBe(true);
  });
});

describe('createPlaceScene: live pictures', () => {
  it('swallows and warns about a failing redraw, so live pictures cannot break the lesson', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fire } = setUp(() => {
      throw new Error('boom');
    });
    expect(() => fire()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('stops listening once disposed', () => {
    const { scene, listening } = setUp();
    expect(listening()).toBe(true);
    scene.dispose();
    expect(listening()).toBe(false);
  });
});
