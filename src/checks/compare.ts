import type { Scene, SceneItem } from '../scene/schema';

// Fraction of the drawing's diagonal an item may be read away from where it was drawn.
export const DEFAULT_TOLERANCE = 0.04;

export type ItemMatch = { expected: string; actual: string; error: number };
export type SceneComparison = {
  matched: ItemMatch[];
  missing: string[];
  extra: string[];
  unflagged: string[];
  invented: string[];
  worstError: number;
  idMap: Map<string, string>;
};

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Body = Exclude<SceneItem, { kind: 'rope' }>;
type Rope = Extract<SceneItem, { kind: 'rope' }>;

const isRope = (item: SceneItem): item is Rope => item.kind === 'rope';

const anchors = (item: Body): Point[] =>
  item.kind === 'ramp' ? [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }] : [{ x: item.x, y: item.y }];

const centre = (item: Body): Point => {
  const points = anchors(item);
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
};

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const anchorError = (expected: Point[], actual: Point[]): number => {
  const inOrder = Math.max(...expected.map((point, i) => distance(point, actual[i] ?? point)));
  if (expected.length < 2) return inOrder;
  const reversed = [...actual].reverse();
  return Math.min(inOrder, Math.max(...expected.map((point, i) => distance(point, reversed[i] ?? point))));
};

const contains = (rect: Rect, point: Point): boolean =>
  Math.abs(point.x - rect.x) <= rect.width / 2 && Math.abs(point.y - rect.y) <= rect.height / 2;

const overlaps = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;

export const compareScenes = (expected: Scene, actual: Scene, tolerance = DEFAULT_TOLERANCE): SceneComparison => {
  const [sx, sy] = [expected.drawing.width / actual.drawing.width, expected.drawing.height / actual.drawing.height];
  const toExpected = (point: Point): Point => ({ x: point.x * sx, y: point.y * sy });
  const toExpectedRect = (rect: Rect): Rect => ({ x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy });
  const diagonal = Math.hypot(expected.drawing.width, expected.drawing.height);

  const expectedBodies = expected.items.filter((item): item is Body => !isRope(item));
  const actualBodies = actual.items.filter((item): item is Body => !isRope(item));

  const candidates = expectedBodies
    .flatMap((want) =>
      actualBodies
        .filter((got) => got.kind === want.kind)
        .map((got) => ({ expected: want.id, actual: got.id, error: anchorError(anchors(want), anchors(got).map(toExpected)) / diagonal })),
    )
    .filter((candidate) => candidate.error <= tolerance)
    .sort((a, b) => a.error - b.error || a.expected.localeCompare(b.expected) || a.actual.localeCompare(b.actual));

  const idMap = new Map<string, string>();
  const taken = new Set<string>();
  const matched: ItemMatch[] = [];
  for (const candidate of candidates) {
    if (idMap.has(candidate.expected) || taken.has(candidate.actual)) continue;
    idMap.set(candidate.expected, candidate.actual);
    taken.add(candidate.actual);
    matched.push(candidate);
  }

  const actualRopes = actual.items.filter(isRope);
  for (const want of expected.items.filter(isRope)) {
    const ends = new Set([idMap.get(want.from), idMap.get(want.to)]);
    const got = actualRopes.find((rope) => !taken.has(rope.id) && ends.has(rope.from) && ends.has(rope.to) && rope.from !== rope.to);
    if (!got) continue;
    idMap.set(want.id, got.id);
    taken.add(got.id);
    matched.push({ expected: want.id, actual: got.id, error: 0 });
  }

  const actualMarks = actual.unknownMarks.map(toExpectedRect);
  return {
    matched,
    missing: expected.items.filter((item) => !idMap.has(item.id)).map((item) => item.id),
    extra: actual.items.filter((item) => !taken.has(item.id)).map((item) => item.id),
    unflagged: expected.unknownMarks.filter((mark) => !actualMarks.some((got) => overlaps(mark, got))).map((mark) => mark.id),
    invented: actualBodies
      .filter((item) => expected.unknownMarks.some((mark) => contains(mark, toExpected(centre(item)))))
      .map((item) => item.id),
    worstError: Math.max(0, ...matched.map((match) => match.error)),
    idMap,
  };
};
