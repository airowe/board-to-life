import type { Scene } from './schema';

// What the class reads instead of an item's id, such as "the last domino" for domino-5.
export const itemName = (scene: Scene, id: string): string => {
  const item = scene.items.find((candidate) => candidate.id === id);
  if (!item) return id.replaceAll('-', ' ');
  const sameKind = scene.items.filter((candidate) => candidate.kind === item.kind);
  const place = sameKind.indexOf(item);
  if (sameKind.length === 1) return `the ${item.kind}`;
  if (place === 0) return `the first ${item.kind}`;
  if (place === sameKind.length - 1) return `the last ${item.kind}`;
  return `${item.kind} ${place + 1}`;
};
