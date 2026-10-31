import type { Figure, Polygon, Transformation } from './schema';

export type Point = { x: number; y: number };
export type Positions = Record<string, Point>;
export type DisplayLength = { value: number; unit: string | null };

export const MEASURE_SCALE_UNITLESS = 100;
export const IMAGE_SUFFIX = '′';

export const STRAIGHT_ANGLE = 180;
export const SHAPE_NAMES: Readonly<Record<number, string>> = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon' };

const VERTICES_BEYOND_A_STRAIGHT_LINE = 2;
const EPSILON = 1e-9;
const FULL_TURN = 360;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export const positionsOf = (figure: Figure): Positions =>
  Object.fromEntries(figure.points.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));

export const angleSumOf = ({ vertices }: Pick<Polygon, 'vertices'>): number =>
  (vertices.length - VERTICES_BEYOND_A_STRAIGHT_LINE) * STRAIGHT_ANGLE;

export const distance = (p: Point, q: Point): number => Math.hypot(q.x - p.x, q.y - p.y);

const cross = (origin: Point, a: Point, b: Point): number =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export const angleAt = (at: Point, from: Point, to: Point): number | null => {
  const first = distance(at, from);
  const second = distance(at, to);
  if (first < EPSILON || second < EPSILON) return null;
  const dot = (from.x - at.x) * (to.x - at.x) + (from.y - at.y) * (to.y - at.y);
  return Math.acos(clamp(dot / (first * second), -1, 1)) * DEGREES_PER_RADIAN;
};

const pointsOf = (positions: Positions, ids: string[]): Point[] | null => {
  const points = ids.map((id) => positions[id]);
  return points.every((entry): entry is Point => entry !== undefined) ? points : null;
};

type Corner = { previous: Point; current: Point; next: Point };

const corners = (points: Point[]): Corner[] =>
  points.map((current, index) => ({
    previous: points.at(index - 1) ?? current,
    current,
    next: points[(index + 1) % points.length] ?? current,
  }));

const pairOf = (positions: Positions, first: string, second: string): [Point, Point] | null => {
  const [p, q] = [positions[first], positions[second]];
  return p && q ? [p, q] : null;
};

const vertexPoints = (positions: Positions, polygon: Polygon): Point[] | null => pointsOf(positions, polygon.vertices);

const signedArea = (points: Point[]): number =>
  corners(points).reduce((sum, { current, next }) => sum + (current.x * next.y - next.x * current.y), 0) / 2;

export const polygonAngles = (positions: Positions, polygon: Polygon): (number | null)[] => {
  const points = vertexPoints(positions, polygon);
  if (points === null) return polygon.vertices.map(() => null);
  const orientation = Math.sign(signedArea(points));
  return corners(points).map(({ previous, current, next }) => {
    const inside = angleAt(current, previous, next);
    if (inside === null) return null;
    const turn = Math.sign(cross(previous, current, next));
    return turn !== 0 && orientation !== 0 && turn !== orientation ? FULL_TURN - inside : inside;
  });
};

const sideOf = (origin: Point, a: Point, b: Point): number => {
  const turn = cross(origin, a, b);
  return Math.abs(turn) <= EPSILON ? 0 : Math.sign(turn);
};

const withinBox = (a: Point, b: Point, point: Point): boolean =>
  point.x >= Math.min(a.x, b.x) - EPSILON &&
  point.x <= Math.max(a.x, b.x) + EPSILON &&
  point.y >= Math.min(a.y, b.y) - EPSILON &&
  point.y <= Math.max(a.y, b.y) + EPSILON;

const segmentsMeet = ([a1, a2]: [Point, Point], [b1, b2]: [Point, Point]): boolean => {
  const sides = [sideOf(b1, b2, a1), sideOf(b1, b2, a2), sideOf(a1, a2, b1), sideOf(a1, a2, b2)] as const;
  const [first, second, third, fourth] = sides;
  if (first * second < 0 && third * fourth < 0) return true;
  return (
    (first === 0 && withinBox(b1, b2, a1)) ||
    (second === 0 && withinBox(b1, b2, a2)) ||
    (third === 0 && withinBox(a1, a2, b1)) ||
    (fourth === 0 && withinBox(a1, a2, b2))
  );
};

const sidesOf = (points: Point[]): [Point, Point][] => corners(points).map(({ current, next }) => [current, next]);

const adjacentSides = (first: number, second: number, count: number): boolean =>
  Math.abs(first - second) <= 1 || Math.abs(first - second) === count - 1;

export const isSimplePolygon = (positions: Positions, polygon: Pick<Polygon, 'vertices'>): boolean => {
  const points = pointsOf(positions, polygon.vertices);
  if (points === null) return false;
  const apart = points.every((point, index) => points.slice(index + 1).every((other) => distance(point, other) >= EPSILON));
  const sides = sidesOf(points);
  return (
    apart &&
    sides.every((side, index) =>
      sides.every((other, otherIndex) => adjacentSides(index, otherIndex, sides.length) || !segmentsMeet(side, other)),
    )
  );
};

export const angleSum = (positions: Positions, polygon: Polygon): number | null => {
  const angles = polygonAngles(positions, polygon);
  return angles.some((entry) => entry === null) ? null : (angles as number[]).reduce((sum, entry) => sum + entry, 0);
};

export const area = (positions: Positions, polygon: Polygon): number | null => {
  const points = vertexPoints(positions, polygon);
  if (points === null) return null;
  const size = Math.abs(signedArea(points));
  return size < EPSILON ? null : size;
};

export const perimeter = (positions: Positions, polygon: Polygon): number => {
  const points = vertexPoints(positions, polygon);
  if (points === null) return 0;
  return corners(points).reduce((sum, { current, next }) => sum + distance(current, next), 0);
};

export const areParallel = (
  positions: Positions,
  a: [string, string],
  b: [string, string],
  toleranceDegrees: number,
): boolean | null => {
  const firstLine = pairOf(positions, a[0], a[1]);
  const secondLine = pairOf(positions, b[0], b[1]);
  if (firstLine === null || secondLine === null) return null;
  const [a1, a2] = firstLine;
  const [b1, b2] = secondLine;
  const first = distance(a1, a2);
  const second = distance(b1, b2);
  if (first < EPSILON || second < EPSILON) return null;
  const dot = ((a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y)) / (first * second);
  const between = Math.acos(clamp(Math.abs(dot), 0, 1)) * DEGREES_PER_RADIAN;
  return between <= toleranceDegrees;
};

type Move = (vertex: Point, t: number) => Point;

const reflectMove = (a: Point, b: Point): Move => {
  const length = distance(a, b);
  if (length < EPSILON) return (vertex) => vertex;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return (vertex, t) => {
    const along = (vertex.x - a.x) * ux + (vertex.y - a.y) * uy;
    const footX = a.x + along * ux;
    const footY = a.y + along * uy;
    const scale = Math.cos(Math.PI * t);
    return { x: footX + (vertex.x - footX) * scale, y: footY + (vertex.y - footY) * scale };
  };
};

export const screenSweepRadians = (degrees: number): number => -degrees / DEGREES_PER_RADIAN;

const rotateMove = (centre: Point, degrees: number): Move => (vertex, t) => {
  const sweep = screenSweepRadians(degrees * t);
  const dx = vertex.x - centre.x;
  const dy = vertex.y - centre.y;
  return {
    x: centre.x + dx * Math.cos(sweep) - dy * Math.sin(sweep),
    y: centre.y + dx * Math.sin(sweep) + dy * Math.cos(sweep),
  };
};

const translateMove = (from: Point, to: Point): Move => (vertex, t) => ({
  x: vertex.x + (to.x - from.x) * t,
  y: vertex.y + (to.y - from.y) * t,
});

const dilateMove = (centre: Point, factor: number): Move => (vertex, t) => {
  const scale = 1 + (factor - 1) * t;
  return { x: centre.x + (vertex.x - centre.x) * scale, y: centre.y + (vertex.y - centre.y) * scale };
};

const moveFor = (positions: Positions, transformation: Transformation): Move | null => {
  switch (transformation.kind) {
    case 'reflect': {
      const ends = pairOf(positions, transformation.mirror[0], transformation.mirror[1]);
      return ends && reflectMove(...ends);
    }
    case 'rotate': {
      const centre = positions[transformation.centre];
      return centre ? rotateMove(centre, transformation.degrees) : null;
    }
    case 'translate': {
      const ends = pairOf(positions, transformation.from, transformation.to);
      return ends && translateMove(...ends);
    }
    case 'dilate': {
      const centre = positions[transformation.centre];
      return centre ? dilateMove(centre, transformation.factor) : null;
    }
  }
};

export const transformAt = (positions: Positions, transformation: Transformation, t: number, polygon: Polygon): Positions => {
  const move = moveFor(positions, transformation) ?? ((vertex: Point) => vertex);
  const entries = polygon.vertices.flatMap((id) => {
    const vertex = positions[id];
    return vertex === undefined ? [] : [[`${id}${IMAGE_SUFFIX}`, move(vertex, t)] as const];
  });
  return Object.fromEntries(entries);
};

export const imageOf = (positions: Positions, transformation: Transformation, polygon: Polygon): Positions =>
  transformAt(positions, transformation, 1, polygon);

const drawnLength = (positions: Positions, from: string, to: string): number | null => {
  const ends = pairOf(positions, from, to);
  return ends === null ? null : distance(...ends);
};

export const displayLength = (figure: Figure, positions: Positions, from: string, to: string): DisplayLength => {
  const drawn = drawnLength(positions, from, to) ?? 0;
  for (const entry of figure.marks) {
    if (entry.kind !== 'length' || entry.value === undefined) continue;
    const referenceDrawn = drawnLength(positions, entry.from, entry.to);
    if (referenceDrawn === null || referenceDrawn < EPSILON) continue;
    return { value: (drawn * entry.value) / referenceDrawn, unit: entry.unit ?? null };
  }
  return { value: drawn / MEASURE_SCALE_UNITLESS, unit: null };
};
