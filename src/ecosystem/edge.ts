import type { Species } from './schema';

export type Point = { x: number; y: number };

// Where the line from a box's centre to another point leaves the box, or the point itself if it is inside.
export const edgePoint = (box: Species, towards: Point): Point => {
  const [dx, dy] = [towards.x - box.x, towards.y - box.y];
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy), 1);
  return { x: box.x + dx * scale, y: box.y + dy * scale };
};
