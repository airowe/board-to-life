import { describe, expect, it } from 'vitest';
import { WEB_SAMPLES } from './samples';
import { GREENS, PREDATOR_REDS, GRAZER_AMBERS, speciesColours } from './colours';
import type { Web } from './schema';

const web = (id: string): Web => {
  const sample = WEB_SAMPLES.find((each) => each.id === id);
  if (!sample) throw new Error(`no sample "${id}"`);
  return sample.web;
};

describe('speciesColours', () => {
  it('colours plants green, what eats them amber and what eats those red, whatever order they were read in', () => {
    const colours = speciesColours(web('ocean'));
    expect(GREENS).toContain(colours.get('kelp'));
    expect(GRAZER_AMBERS).toContain(colours.get('urchin'));
    expect(PREDATOR_REDS).toContain(colours.get('otter'));
  });

  it('gives grass a green, not the next colour on a list', () => {
    expect(GREENS).toContain(speciesColours(web('grassland')).get('grass'));
  });

  it.each(WEB_SAMPLES.map((sample) => [sample.id, sample.web] as const))('tells every species in %s apart', (_id, sampleWeb) => {
    const used = [...speciesColours(sampleWeb).values()];
    expect(new Set(used).size).toBe(sampleWeb.species.length);
  });
});
