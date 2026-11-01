import type { Web } from './schema';
import { trophicLevels } from './trophic';

const FIRST_PREDATOR_LEVEL = 3;

export const GREENS: readonly string[] = ['#2e8b57', '#5c9e31', '#0f6b4f', '#8aa62a'];
export const GRAZER_AMBERS: readonly string[] = ['#d98a00', '#a8620b', '#e0b000', '#8f6f2e'];
export const PREDATOR_REDS: readonly string[] = ['#c0392b', '#8e2a5b', '#e0603f', '#7b3fa0', '#5b4bb0'];
const DECOMPOSER_BROWNS: readonly string[] = ['#6d5a45', '#0f7c8a', '#8a7f6e'];

// Colours say where a species sits in the food chain: plants green, what eats them amber, what eats those red.
export const speciesColours = (web: Web): Map<string, string> => {
  const levels = trophicLevels(web);
  const usedFrom = new Map<readonly string[], number>();
  return new Map(
    web.species.map((entry) => {
      const level = levels.get(entry.id) ?? FIRST_PREDATOR_LEVEL;
      const shades = entry.role === 'producer' ? GREENS : entry.role === 'decomposer' ? DECOMPOSER_BROWNS : level < FIRST_PREDATOR_LEVEL ? GRAZER_AMBERS : PREDATOR_REDS;
      const used = usedFrom.get(shades) ?? 0;
      usedFrom.set(shades, used + 1);
      return [entry.id, shades[used % shades.length] as string];
    }),
  );
};
