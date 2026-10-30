import type { Body } from './schema';

export type Point = { x: number; y: number };

// Round things are traced as polygons with this many sides; close enough to judge overlaps and touches.
const ROUND_SIDES = 16;

const rectangle = (x: number, y: number, width: number, height: number, angle: number): Point[] => {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx = 0, sy = 0]) => {
    const [dx, dy] = [(sx * width) / 2, (sy * height) / 2];
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos };
  });
};

const round = (x: number, y: number, radius: number): Point[] =>
  Array.from({ length: ROUND_SIDES }, (_, index) => {
    const turn = (index / ROUND_SIDES) * Math.PI * 2;
    return { x: x + radius * Math.cos(turn), y: y + radius * Math.sin(turn) };
  });

// The space a body takes up, as a convex polygon in drawing units.
export const outlineOf = (body: Body): Point[] | null => {
  switch (body.kind) {
    case 'ball':
    case 'pulley':
      return round(body.x, body.y, body.radius);
    case 'block':
    case 'domino':
    case 'lever':
      return rectangle(body.x, body.y, body.width, body.height, body.angle);
    case 'wall':
    case 'floor':
      return rectangle(body.x, body.y, body.width, body.height, 0);
    case 'cart': {
      // The wheels hang a wheel radius below the body's bottom edge, so the outline does too.
      const [cos, sin] = [Math.cos(body.angle), Math.sin(body.angle)];
      const drop = body.wheelRadius / 2;
      return rectangle(body.x - drop * sin, body.y + drop * cos, body.width, body.height + body.wheelRadius, body.angle);
    }
    case 'ramp': {
      const length = Math.hypot(body.x2 - body.x1, body.y2 - body.y1);
      const angle = Math.atan2(body.y2 - body.y1, body.x2 - body.x1);
      return rectangle((body.x1 + body.x2) / 2, (body.y1 + body.y2) / 2, length, body.thickness, angle);
    }
    case 'pivot':
      return null;
  }
};

const edgeNormals = (polygon: Point[]): Point[] =>
  polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? point;
    const [dx, dy] = [next.x - point.x, next.y - point.y];
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });

const project = (polygon: Point[], axis: Point): [number, number] => {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return [Math.min(...values), Math.max(...values)];
};

// How far two convex polygons would have to separate to stop overlapping; 0 when they are apart or only touch.
export const penetration = (a: Point[], b: Point[]): number => {
  let depth = Infinity;
  for (const axis of [...edgeNormals(a), ...edgeNormals(b)]) {
    const [minA, maxA] = project(a, axis);
    const [minB, maxB] = project(b, axis);
    const overlap = Math.min(maxA - minB, maxB - minA);
    if (overlap <= 0) return 0;
    depth = Math.min(depth, overlap);
  }
  return depth === Infinity ? 0 : depth;
};

const toSegment = (point: Point, a: Point, b: Point): number => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

// Distance from a point to a convex polygon; 0 anywhere inside it.
export const distanceTo = (polygon: Point[], point: Point): number => {
  const sides = edgeNormals(polygon).map((normal, index) => {
    const corner = polygon[index] ?? point;
    return (point.x - corner.x) * normal.x + (point.y - corner.y) * normal.y;
  });
  // Inside means on the same side of every edge, whichever way round the corners run.
  if (sides.every((side) => side >= 0) || sides.every((side) => side <= 0)) return 0;
  return Math.min(...polygon.map((corner, index) => toSegment(point, corner, polygon[(index + 1) % polygon.length] ?? corner)));
};
