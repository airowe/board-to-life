import type { Figure } from '../geometry/schema';

export type EditQueue = { add: (edit: () => Promise<void>) => void; idle: () => Promise<void> };

export const createEditQueue = (): EditQueue => {
  let tail: Promise<void> = Promise.resolve();
  return {
    add: (edit) => {
      tail = tail.then(edit).catch(() => undefined);
    },
    idle: () => tail,
  };
};

export const samePoints = (first: Figure['points'], second: Figure['points']): boolean =>
  first.length === second.length &&
  first.every((entry, index) => {
    const other = second[index];
    return other !== undefined && entry.id === other.id && entry.x === other.x && entry.y === other.y && entry.confidence === other.confidence;
  });
