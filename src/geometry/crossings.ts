import { distance, positionsOf, type Point, type Positions } from './derive';
import type { Figure } from './schema';

export type PointPair = [string, string];
export type Crossing = { point: string; lines: [PointPair, PointPair] };

export const CROSSING_SNAP_FRACTION = 0.05;
export const CROSSING_MARGIN_FRACTION = 0.05;
export const CROSSING_TOLERANCE_PIXELS = 0.5;

const EPSILON = 1e-9;

type Drawing = Figure['drawing'];
type Reach = 'both ways' | 'forwards' | 'between';
type DrawnLine = { ends: PointPair; reach: Reach };

const drawnWithReach = (figure: Figure): DrawnLine[] => [
  ...figure.lines.map((entry): DrawnLine => ({ ends: [entry.from, entry.to], reach: 'both ways' })),
  ...figure.segments.map((entry): DrawnLine => ({ ends: [entry.from, entry.to], reach: 'between' })),
  ...figure.rays.map((entry): DrawnLine => ({ ends: [entry.from, entry.to], reach: 'forwards' })),
];

export const drawnLines = (figure: Figure): PointPair[] => drawnWithReach(figure).map(({ ends }) => ends);

export const crossingOf = ([a1, a2]: [Point, Point], [b1, b2]: [Point, Point]): Point | null => {
  const denominator = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(denominator) < EPSILON) return null;
  const along = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / denominator;
  return { x: a1.x + (a2.x - a1.x) * along, y: a1.y + (a2.y - a1.y) * along };
};

export const endsOf = (positions: Positions, [from, to]: PointPair): [Point, Point] | null => {
  const [a, b] = [positions[from], positions[to]];
  return a && b ? [a, b] : null;
};

const meetingOf = (positions: Positions, [first, second]: [PointPair, PointPair]): Point | null => {
  const [a, b] = [endsOf(positions, first), endsOf(positions, second)];
  return a && b ? crossingOf(a, b) : null;
};

const marginOf = (drawing: Drawing): number => CROSSING_MARGIN_FRACTION * drawing.width;

const shareAnEnd = (first: DrawnLine, second: DrawnLine): boolean => first.ends.some((id) => second.ends.includes(id));

const linePairs = (lines: DrawnLine[]): [DrawnLine, DrawnLine][] =>
  lines.flatMap((first, index) =>
    lines
      .slice(index + 1)
      .filter((second) => !shareAnEnd(first, second))
      .map((second): [DrawnLine, DrawnLine] => [first, second]),
  );

const reaches = (positions: Positions, { ends, reach }: DrawnLine, meets: Point, margin: number): boolean => {
  const found = endsOf(positions, ends);
  if (found === null) return false;
  const [a, b] = found;
  const length = distance(a, b);
  if (reach === 'both ways' || length < EPSILON) return true;
  const along = ((meets.x - a.x) * (b.x - a.x) + (meets.y - a.y) * (b.y - a.y)) / length;
  return along >= -margin && (reach === 'forwards' || along <= length + margin);
};

const onDrawing = (meets: Point, drawing: Drawing): boolean => {
  const margin = marginOf(drawing);
  return (
    meets.x >= -margin && meets.x <= drawing.width + margin && meets.y >= -margin && meets.y <= drawing.height + margin
  );
};

const meetingOnDrawing = (positions: Positions, lines: [PointPair, PointPair], drawing: Drawing): Point | null => {
  const meets = meetingOf(positions, lines);
  return meets !== null && onDrawing(meets, drawing) ? meets : null;
};

type Candidate = { lines: [PointPair, PointPair]; gap: number };

const nearestMeeting = (positions: Positions, at: Point, pairs: [DrawnLine, DrawnLine][], margin: number): Candidate | null =>
  pairs.reduce<Candidate | null>((best, [first, second]) => {
    const lines: [PointPair, PointPair] = [first.ends, second.ends];
    const meets = meetingOf(positions, lines);
    if (meets === null || !reaches(positions, first, meets, margin) || !reaches(positions, second, meets, margin)) return best;
    const gap = distance(at, meets);
    return best === null || gap < best.gap ? { lines, gap } : best;
  }, null);

const transformationPoints = (figure: Figure): string[] =>
  figure.transformations.flatMap((entry) => {
    switch (entry.kind) {
      case 'reflect':
        return entry.mirror;
      case 'rotate':
      case 'dilate':
        return [entry.centre];
      case 'translate':
        return [entry.from, entry.to];
    }
  });

const neverCrossings = (figure: Figure, lines: DrawnLine[]): Set<string> =>
  new Set([
    ...lines.flatMap(({ ends }) => ends),
    ...figure.polygons.flatMap(({ vertices }) => vertices),
    ...transformationPoints(figure),
    ...figure.labels.map(({ text }) => text),
  ]);

export const crossingsOf = (figure: Figure): Crossing[] => {
  const positions = positionsOf(figure);
  const lines = drawnWithReach(figure);
  const excluded = neverCrossings(figure, lines);
  const pairs = linePairs(lines);
  const snap = CROSSING_SNAP_FRACTION * figure.drawing.width;
  const margin = marginOf(figure.drawing);
  return figure.points.flatMap(({ id, x, y }) => {
    if (excluded.has(id)) return [];
    const nearest = nearestMeeting(positions, { x, y }, pairs, margin);
    return nearest !== null && nearest.gap <= snap ? [{ point: id, lines: nearest.lines }] : [];
  });
};

export const placeCrossings = (positions: Positions, crossings: Crossing[], drawing: Drawing): Positions =>
  crossings.reduce((next, { point, lines }) => {
    const meets = meetingOnDrawing(next, lines, drawing);
    return meets === null ? next : { ...next, [point]: meets };
  }, positions);

export const crossingsInPlace = (positions: Positions, crossings: Crossing[], drawing: Drawing): boolean =>
  crossings.every(({ point, lines }) => {
    const [at, meets] = [positions[point], meetingOnDrawing(positions, lines, drawing)];
    return at === undefined || meets === null || distance(at, meets) <= CROSSING_TOLERANCE_PIXELS;
  });
