type Point = { x: number; y: number };

// Share of the length left straight at each end, where the spring hooks onto what it joins.
const LEAD = 0.12;

export const zigzag = (from: Point, to: Point, coils: number, amplitude: number): Point[] => {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [from, to];
  const [nx, ny] = [-dy / length, dx / length];
  const at = (t: number, side: number): Point => ({ x: from.x + dx * t + nx * side, y: from.y + dy * t + ny * side });
  const turns = coils * 2;
  const swings = Array.from({ length: turns }, (_, i) => at(LEAD + ((1 - 2 * LEAD) * (i + 0.5)) / turns, i % 2 === 0 ? -amplitude : amplitude));
  return [from, at(LEAD, 0), ...swings, at(1 - LEAD, 0), to];
};
