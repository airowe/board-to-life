import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSimulation, runUntil, SETTLE_SECONDS, STEPS_PER_SECOND } from '../physics/simulation';
import { SAMPLES, sampleUrl } from './scenes';

const SETTLE_STEPS = SETTLE_SECONDS * STEPS_PER_SECOND;
// Far enough that the class sees it go down, not just settle onto the floor.
const SINK_DISTANCE = 100;

const settle = (sample: (typeof SAMPLES)[number]) => {
  const simulation = createSimulation(sample.scene);
  const start = new Map(simulation.snapshot().map((body) => [body.id, body.y]));
  for (let step = 0; step < SETTLE_STEPS; step += 1) simulation.step();
  const end = new Map(simulation.snapshot().map((body) => [body.id, body.y]));
  return { simulation, start, end };
};

describe('SAMPLES', () => {
  it('has a distinct id for every sample', () => {
    const ids = SAMPLES.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))('%s has a drawn image in public/', (_, sample) => {
    expect(existsSync(new URL(`../../public${sampleUrl(sample.id)}`, import.meta.url))).toBe(true);
  });

  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))('%s reaches its predict point', (_, sample) => {
    const [point] = sample.scene.predictPoints;
    expect(point).toBeDefined();
    if (!point) return;
    expect(runUntil(createSimulation(sample.scene), point.trigger, SETTLE_STEPS)).not.toBeNull();
  });

  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))('%s plays out as described', (_, sample) => {
    const { simulation, start, end } = settle(sample);
    const fallen = (item: string): boolean => simulation.observe({ kind: 'fallen', item });
    expect(sample.outcome.falls.filter((item) => !fallen(item))).toEqual([]);
    expect(sample.outcome.stays.filter(fallen)).toEqual([]);
    const sunk = sample.outcome.sinks.filter((item) => (end.get(item) ?? 0) - (start.get(item) ?? 0) >= SINK_DISTANCE);
    expect(sunk).toEqual(sample.outcome.sinks);
  });

  it('expects something to happen in every sample', () => {
    const quiet = SAMPLES.filter(({ outcome }) => outcome.falls.length + outcome.sinks.length === 0 && outcome.stays.length === 0);
    expect(quiet.map((sample) => sample.id)).toEqual([]);
  });
});
