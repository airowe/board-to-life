import { crossingsOf, drawnLines, placeCrossings, type PointPair } from './crossings';
import { angleAt, angleSum, angleSumOf, area, distance, imageOf, isSimplePolygon, positionsOf, type Point, type Positions } from './derive';
import { FIT_TOLERANCE_DEGREES, FIT_TOLERANCE_FRACTION } from './fit';
import type { Figure, Focus, Mark, Polygon, Transformation } from './schema';

export type FigureFact =
  | { kind: 'angle-sum'; polygon: string; degrees: number }
  | { kind: 'equal-angles'; marks: [string, string]; degrees: number }
  | { kind: 'lands'; transformation: string; image: Positions }
  | { kind: 'congruent'; transformation: string }
  | { kind: 'area-scale'; transformation: string; factor: number };

export type FocusOption = { value: string; label: string; focus: Focus };

export const INVARIANT_SAMPLE_POSITIONS = 12;

const DRAG_RADIUS_FRACTION = 0.1;
const LINE_CLEARANCE_FRACTION = 0.8;
const ON_LINE_TOLERANCE = 2;
const SIDE_TOLERANCE = 1;
const EPSILON = 1e-9;

const NOUNS: Record<Transformation['kind'], string> = {
  reflect: 'reflection',
  rotate: 'rotation',
  translate: 'translation',
  dilate: 'dilation',
};

type AngleMark = Extract<Mark, { kind: 'angle' }>;
type ParallelCrossing = {
  lines: [PointPair, PointPair];
  transversal: PointPair;
  marks: [AngleMark, AngleMark];
  drag: string;
};

const polygonName = (polygon: Polygon): string => polygon.vertices.join('');

const polygonById = (figure: Figure, id: string): Polygon | undefined => figure.polygons.find((entry) => entry.id === id);

export const focusLabel = (figure: Figure, focus: Focus): string => {
  switch (focus.kind) {
    case 'transform': {
      const transformation = figure.transformations.find((entry) => entry.id === focus.transformation);
      const polygon = transformation && polygonById(figure, transformation.polygon);
      return transformation && polygon ? `Play the ${NOUNS[transformation.kind]} of ${polygonName(polygon)}` : `Play ${focus.transformation}`;
    }
    case 'angle-sum': {
      const polygon = polygonById(figure, focus.polygon);
      return `Angle sum of ${polygon ? polygonName(polygon) : focus.polygon} (drag ${focus.drag})`;
    }
    case 'equal-angles':
      return `Equal angles at the parallel lines (drag ${focus.drag})`;
  }
};

const transformOption = (figure: Figure, transformation: Transformation): FocusOption[] => {
  if (polygonById(figure, transformation.polygon) === undefined) return [];
  const focus: Focus = { kind: 'transform', transformation: transformation.id };
  return [{ value: `transform:${transformation.id}`, label: focusLabel(figure, focus), focus }];
};

const angleSumOption = (figure: Figure, polygon: Polygon): FocusOption => {
  const focus: Focus = { kind: 'angle-sum', polygon: polygon.id, drag: polygon.vertices.at(-1) ?? '' };
  return { value: `angle-sum:${polygon.id}`, label: focusLabel(figure, focus), focus };
};

const equalAnglesOption = (figure: Figure, { marks: [first, second], drag }: ParallelCrossing): FocusOption => {
  const focus: Focus = { kind: 'equal-angles', marks: [first.id, second.id], drag };
  return { value: `equal-angles:${first.id}:${second.id}`, label: focusLabel(figure, focus), focus };
};

const offLine = (point: Point, a: Point, b: Point): number => {
  const length = distance(a, b);
  if (length < EPSILON) return Number.POSITIVE_INFINITY;
  return Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length;
};

const liesOn = (positions: Positions, id: string, [from, to]: PointPair): boolean => {
  const [point, a, b] = [positions[id], positions[from], positions[to]];
  return point !== undefined && a !== undefined && b !== undefined && offLine(point, a, b) <= ON_LINE_TOLERANCE;
};

const samePair = (a: PointPair, b: PointPair): boolean => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

const parallelPairs = (figure: Figure): [PointPair, PointPair][] =>
  figure.marks.flatMap((entry) =>
    entry.kind === 'parallel'
      ? entry.lines.flatMap((first, index) => entry.lines.slice(index + 1).map((second): [PointPair, PointPair] => [first, second]))
      : [],
  );

const fartherEnd = (positions: Positions, [from, to]: PointPair, crossings: [string, string]): string => {
  const nearestCrossing = (id: string): number => {
    const end = positions[id];
    const gaps = crossings.flatMap((crossing) => {
      const at = positions[crossing];
      return end && at ? [distance(end, at)] : [];
    });
    return gaps.length === 0 ? 0 : Math.min(...gaps);
  };
  return nearestCrossing(to) > nearestCrossing(from) ? to : from;
};

const parallelCrossings = (figure: Figure): ParallelCrossing[] => {
  const positions = positionsOf(figure);
  const angles = figure.marks.filter((entry): entry is AngleMark => entry.kind === 'angle');
  return parallelPairs(figure).flatMap((lines) =>
    drawnLines(figure)
      .filter((transversal) => !lines.some((line) => samePair(line, transversal)))
      .flatMap((transversal) => {
        const at = (line: PointPair): AngleMark[] =>
          angles.filter((entry) => liesOn(positions, entry.at, line) && liesOn(positions, entry.at, transversal));
        return at(lines[0]).flatMap((first) =>
          at(lines[1])
            .filter((second) => second.at !== first.at)
            .map((second) => ({
              lines,
              transversal,
              marks: [first, second] as [AngleMark, AngleMark],
              drag: fartherEnd(positions, transversal, [first.at, second.at]),
            })),
        );
      }),
  );
};

export const focusOptions = (figure: Figure): FocusOption[] => [
  ...figure.transformations.flatMap((entry) => transformOption(figure, entry)),
  ...figure.polygons.map((polygon) => angleSumOption(figure, polygon)),
  ...parallelCrossings(figure).map((crossing) => equalAnglesOption(figure, crossing)),
];

export const suggestedFocus = (figure: Figure): Focus | null => {
  if (figure.focus !== null) return figure.focus;
  const options = focusOptions(figure);
  const first = (kind: Focus['kind']): Focus | undefined => options.find((option) => option.focus.kind === kind)?.focus;
  return first('transform') ?? first('equal-angles') ?? first('angle-sum') ?? null;
};

const markAngle = (positions: Positions, entry: AngleMark): number | null => {
  const [at, from, to] = [positions[entry.at], positions[entry.from], positions[entry.to]];
  return at && from && to ? angleAt(at, from, to) : null;
};

const angleMarkById = (figure: Figure, id: string): AngleMark | undefined =>
  figure.marks.find((entry): entry is AngleMark => entry.kind === 'angle' && entry.id === id);

const angleSumFacts = (figure: Figure, positions: Positions, polygonId: string): FigureFact[] => {
  const polygon = polygonById(figure, polygonId);
  const degrees = polygon && angleSum(positions, polygon);
  return degrees === undefined || degrees === null ? [] : [{ kind: 'angle-sum', polygon: polygonId, degrees }];
};

const equalAnglesFacts = (figure: Figure, positions: Positions, marks: PointPair): FigureFact[] => {
  const [first, second] = marks.map((id) => angleMarkById(figure, id));
  const degrees = first && markAngle(positions, first);
  const other = second && markAngle(positions, second);
  if (degrees === undefined || degrees === null || other === undefined || other === null) return [];
  return Math.abs(degrees - other) <= FIT_TOLERANCE_DEGREES ? [{ kind: 'equal-angles', marks, degrees }] : [];
};

const transformFacts = (figure: Figure, positions: Positions, transformationId: string): FigureFact[] => {
  const transformation = figure.transformations.find((entry) => entry.id === transformationId);
  const polygon = transformation && polygonById(figure, transformation.polygon);
  if (transformation === undefined || polygon === undefined) return [];
  const image = imageOf(positions, transformation, polygon);
  const lands: FigureFact = { kind: 'lands', transformation: transformationId, image };
  if (transformation.kind !== 'dilate') return [lands, { kind: 'congruent', transformation: transformationId }];
  const before = area(positions, polygon);
  const after = area(image, { ...polygon, vertices: Object.keys(image) });
  if (before === null || after === null) return [lands];
  return [lands, { kind: 'area-scale', transformation: transformationId, factor: after / before }];
};

const factsAt = (figure: Figure, positions: Positions, focus: Focus): FigureFact[] => {
  switch (focus.kind) {
    case 'angle-sum':
      return angleSumFacts(figure, positions, focus.polygon);
    case 'equal-angles':
      return equalAnglesFacts(figure, positions, focus.marks);
    case 'transform':
      return transformFacts(figure, positions, focus.transformation);
  }
};

export const factsFor = (figure: Figure, focus: Focus): FigureFact[] => factsAt(figure, positionsOf(figure), focus);

const crossingFor = (figure: Figure, marks: PointPair): ParallelCrossing | undefined =>
  parallelCrossings(figure).find(({ marks: [first, second] }) => first.id === marks[0] && second.id === marks[1]);

export const followCrossings = (positions: Positions, figure: Figure, marks: PointPair): Positions =>
  crossingFor(figure, marks) === undefined ? positions : placeCrossings(positions, crossingsOf(figure), figure.drawing);

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

const linesToStayBeside = (figure: Figure, drag: string): PointPair[] =>
  crossingsOf(figure).flatMap(({ lines: [first, second] }) => {
    if (first.includes(drag) && !second.includes(drag)) return [second];
    if (second.includes(drag) && !first.includes(drag)) return [first];
    return [];
  });

const dragRadius = (figure: Figure, focus: Focus, drag: string, origin: Point): number => {
  const positions = positionsOf(figure);
  const beside = focus.kind === 'equal-angles' ? linesToStayBeside(figure, drag) : [];
  const clearances = beside.flatMap(([from, to]) => {
    const [a, b] = [positions[from], positions[to]];
    return a && b ? [LINE_CLEARANCE_FRACTION * offLine(origin, a, b)] : [];
  });
  return Math.min(figure.drawing.width * DRAG_RADIUS_FRACTION, ...clearances);
};

const dragSpots = (figure: Figure, origin: Point, radius: number): Point[] =>
  Array.from({ length: INVARIANT_SAMPLE_POSITIONS }, (_, index) => {
    const turn = (2 * Math.PI * index) / INVARIANT_SAMPLE_POSITIONS;
    return {
      x: clamp(origin.x + radius * Math.cos(turn), 0, figure.drawing.width),
      y: clamp(origin.y + radius * Math.sin(turn), 0, figure.drawing.height),
    };
  });

const sideLengths = (positions: Positions, vertices: string[]): number[] | null => {
  const points = vertices.map((id) => positions[id]);
  if (!points.every((entry): entry is Point => entry !== undefined)) return null;
  return points.map((point, index) => distance(point, points[(index + 1) % points.length] ?? point));
};

const isCongruent = (positions: Positions, polygon: Polygon, image: Positions): boolean => {
  const before = sideLengths(positions, polygon.vertices);
  const after = sideLengths(image, Object.keys(image));
  return (
    before !== null &&
    after !== null &&
    before.length === after.length &&
    before.every((length, index) => Math.abs(length - (after[index] ?? Number.NaN)) <= SIDE_TOLERANCE)
  );
};

const transformHolds = (figure: Figure, positions: Positions, transformationId: string): boolean => {
  const transformation = figure.transformations.find((entry) => entry.id === transformationId);
  const polygon = transformation && polygonById(figure, transformation.polygon);
  if (transformation === undefined || polygon === undefined) return false;
  const image = imageOf(positions, transformation, polygon);
  if (transformation.kind !== 'dilate') return isCongruent(positions, polygon, image);
  const before = area(positions, polygon);
  const after = area(image, { ...polygon, vertices: Object.keys(image) });
  const expected = transformation.factor ** 2;
  return before !== null && after !== null && Math.abs(after / before - expected) <= FIT_TOLERANCE_FRACTION * expected;
};

const factHolds = (figure: Figure, positions: Positions, focus: Focus): boolean => {
  switch (focus.kind) {
    case 'angle-sum': {
      const polygon = polygonById(figure, focus.polygon);
      const [fact] = angleSumFacts(figure, positions, focus.polygon);
      const expected = polygon && angleSumOf(polygon);
      return fact?.kind === 'angle-sum' && expected !== undefined && Math.abs(fact.degrees - expected) <= FIT_TOLERANCE_DEGREES;
    }
    case 'equal-angles':
      return equalAnglesFacts(figure, positions, focus.marks).length > 0;
    case 'transform':
      return transformHolds(figure, positions, focus.transformation);
  }
};

const dragPointOf = (figure: Figure, focus: Focus): string | undefined => {
  if (focus.kind !== 'transform') return focus.drag;
  const transformation = figure.transformations.find((entry) => entry.id === focus.transformation);
  return transformation && polygonById(figure, transformation.polygon)?.vertices.at(-1);
};

const movedTo = (figure: Figure, focus: Focus, drag: string, spot: Point): Positions => {
  const positions = { ...positionsOf(figure), [drag]: spot };
  return focus.kind === 'equal-angles' ? followCrossings(positions, figure, focus.marks) : positions;
};

const keepsItsShape = (figure: Figure, focus: Focus, positions: Positions): boolean => {
  if (focus.kind !== 'angle-sum') return true;
  const polygon = polygonById(figure, focus.polygon);
  return polygon === undefined || isSimplePolygon(positions, polygon);
};

export const invariantHolds = (figure: Figure, focus: Focus): boolean => {
  const drag = dragPointOf(figure, focus);
  const origin = drag === undefined ? undefined : positionsOf(figure)[drag];
  if (drag === undefined || origin === undefined) return false;
  return dragSpots(figure, origin, dragRadius(figure, focus, drag, origin))
    .map((spot) => movedTo(figure, focus, drag, spot))
    .filter((positions) => keepsItsShape(figure, focus, positions))
    .every((positions) => factHolds(figure, positions, focus));
};
