import type { Eats, Species, Web, WebEvent } from './schema';

const DECOMPOSER_LEVEL = 0;
const PRODUCER_LEVEL = 1;
const FIRST_CONSUMER_LEVEL = 2;

const roleOf = (web: Web): Map<string, Species['role']> => new Map(web.species.map((entry) => [entry.id, entry.role]));

const intoProducer = (arrow: Eats, roles: Map<string, Species['role']>): boolean => roles.get(arrow.to) === 'producer';

export const backwardArrows = (web: Web): string[] => {
  const roles = roleOf(web);
  const flaggedIntoProducer = new Set(web.eats.filter((arrow) => intoProducer(arrow, roles)).map((arrow) => arrow.id));
  const hasIncoming = (speciesId: string, except: string): boolean =>
    web.eats.some((arrow) => arrow.to === speciesId && arrow.id !== except && !flaggedIntoProducer.has(arrow.id));
  const flaggedFromUnfed = (arrow: Eats): boolean =>
    roles.get(arrow.from) === 'consumer' &&
    roles.get(arrow.to) === 'consumer' &&
    !hasIncoming(arrow.from, arrow.id) &&
    hasIncoming(arrow.to, arrow.id);
  return web.eats.filter((arrow) => flaggedIntoProducer.has(arrow.id) || flaggedFromUnfed(arrow)).map((arrow) => arrow.id);
};

export const trophicLevels = (web: Web): Map<string, number> => {
  const roles = roleOf(web);
  const feeding = web.eats.filter((arrow) => roles.get(arrow.from) !== 'decomposer' && roles.get(arrow.to) === 'consumer');
  const cap = web.species.length + FIRST_CONSUMER_LEVEL;
  const levels = new Map(
    web.species.map((entry) => [
      entry.id,
      entry.role === 'producer' ? PRODUCER_LEVEL : entry.role === 'decomposer' ? DECOMPOSER_LEVEL : FIRST_CONSUMER_LEVEL,
    ]),
  );
  for (let pass = 0; pass < web.species.length; pass += 1) {
    for (const arrow of feeding) {
      const candidate = Math.min((levels.get(arrow.from) ?? PRODUCER_LEVEL) + 1, cap);
      if (candidate > (levels.get(arrow.to) ?? FIRST_CONSUMER_LEVEL)) levels.set(arrow.to, candidate);
    }
  }
  return levels;
};

export const flipArrow = (web: Web, eatsId: string): Web => ({
  ...web,
  eats: web.eats.map((arrow) => (arrow.id === eatsId ? { ...arrow, from: arrow.to, to: arrow.from } : arrow)),
});

export const suggestedEvent = (web: Web): WebEvent => {
  if (web.event) return web.event;
  const levels = trophicLevels(web);
  let top: Species | undefined;
  for (const entry of web.species) {
    if (entry.role === 'consumer' && (top === undefined || (levels.get(entry.id) ?? 0) > (levels.get(top.id) ?? 0))) top = entry;
  }
  return top ? { kind: 'remove', species: top.id } : { kind: 'drought' };
};
