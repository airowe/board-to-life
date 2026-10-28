import type { Link } from './schema';
import { zigzag } from './zigzag';

type Point = { x: number; y: number };

export const SPRING_COILS = 6;
export const SPRING_AMPLITUDE = 14;

export const linkPoints = (link: Link, at: (id: string) => Point | null): Point[] => {
  const [from, to] = [at(link.from), at(link.to)];
  if (!from || !to) return [];
  if (link.kind === 'spring') return zigzag(from, to, SPRING_COILS, SPRING_AMPLITUDE);
  const over = link.over === undefined ? null : at(link.over);
  return over ? [from, over, to] : [from, to];
};
