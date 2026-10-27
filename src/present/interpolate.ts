import type { BodySnapshot } from '../physics/simulation';

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;

export const interpolate = (previous: BodySnapshot[], current: BodySnapshot[], alpha: number): BodySnapshot[] => {
  const t = Math.min(1, Math.max(0, alpha));
  if (t === 1) return current;
  const before = new Map(previous.map((body) => [body.id, body]));
  return current.map((body) => {
    const from = before.get(body.id);
    if (!from) return body;
    return { id: body.id, x: lerp(from.x, body.x, t), y: lerp(from.y, body.y, t), angle: lerp(from.angle, body.angle, t) };
  });
};
