import { crossingsInPlace, crossingsOf, placeCrossings, type Crossing, type PointPair } from './crossings';
import { angleAt, angleSumOf, areParallel, distance, positionsOf, SHAPE_NAMES, STRAIGHT_ANGLE, type Point, type Positions } from './derive';
import type { Figure, Mark } from './schema';

export const FIT_TOLERANCE_DEGREES = 0.5;
export const FIT_TOLERANCE_FRACTION = 0.005;
export const FIT_ITERATIONS = 500;

export type FitResult = { ok: true; figure: Figure } | { ok: false; conflicts: string[] };

const RIGHT_ANGLE = 90;
const EPSILON = 1e-9;
const DISPLAY_STEPS = 10;
const RADIANS_PER_DEGREE = Math.PI / 180;

const TRIANGLE_SIDES = 3;

type WrittenAngle = Extract<Mark, { kind: 'angle' }> & { degrees: number };
type WrittenLength = Extract<Mark, { kind: 'length' }> & { value: number };

type AngleConstraint = { kind: 'angle'; at: string; from: string; to: string; degrees: number; description: string };
type LengthConstraint = {
  kind: 'length';
  from: string;
  to: string;
  value: number;
  reference: WrittenLength;
  description: string;
};
type ParallelConstraint = { kind: 'parallel'; lines: [PointPair, PointPair]; description: string };
type Constraint = AngleConstraint | LengthConstraint | ParallelConstraint;

const formatNumber = (value: number): string => String(Math.round(value * DISPLAY_STEPS) / DISPLAY_STEPS);

const listOf = (items: string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const angleName = (at: string, from: string, to: string): string => `${from}${at}${to}`;

const isWrittenAngle = (entry: Mark): entry is WrittenAngle => entry.kind === 'angle' && entry.degrees !== undefined;

const isWrittenLength = (entry: Mark): entry is WrittenLength => entry.kind === 'length' && entry.value !== undefined;

const betweenRays = (entry: WrittenAngle, at: string, first: string, second: string): boolean =>
  entry.at === at && ((entry.from === first && entry.to === second) || (entry.from === second && entry.to === first));

const differ = (first: number, second: number): boolean => Math.abs(first - second) > FIT_TOLERANCE_DEGREES;

const sameRayConflicts = (angles: WrittenAngle[]): string[] =>
  angles.flatMap((first, index) =>
    angles
      .slice(index + 1)
      .filter((second) => betweenRays(second, first.at, first.from, first.to) && differ(first.degrees, second.degrees))
      .map(
        (second) =>
          `Two different angles are written for angle ${angleName(first.at, first.from, first.to)}: ` +
          `${formatNumber(first.degrees)}° and ${formatNumber(second.degrees)}°.`,
      ),
  );

type CornerValue = { at: string; degrees: number };

const writtenCorners = (vertices: string[], angles: WrittenAngle[]): (CornerValue | null)[] =>
  vertices.map((at, index) => {
    const previous = vertices.at(index - 1) ?? at;
    const next = vertices[(index + 1) % vertices.length] ?? at;
    const found = angles.find((entry) => betweenRays(entry, at, previous, next));
    return found ? { at, degrees: found.degrees } : null;
  });

const cornerList = (corners: CornerValue[]): string =>
  listOf(corners.map(({ at, degrees }) => `${at} (${formatNumber(degrees)}°)`));

const shapeName = (sides: number): string => SHAPE_NAMES[sides] ?? `${sides}-sided polygon`;

const polygonConflict = (vertices: string[], angles: WrittenAngle[]): string[] => {
  const corners = writtenCorners(vertices, angles);
  const written = corners.filter((entry): entry is CornerValue => entry !== null);
  const sum = written.reduce((total, { degrees }) => total + degrees, 0);
  if (written.length === vertices.length) {
    const expected = angleSumOf({ vertices });
    return differ(sum, expected)
      ? [
          `The angles written at ${cornerList(written)} add up to ${formatNumber(sum)}°, ` +
            `but a ${shapeName(vertices.length)}'s angles add up to ${formatNumber(expected)}°.`,
        ]
      : [];
  }
  const isTriangle = vertices.length === TRIANGLE_SIDES;
  return isTriangle && written.length > 1 && sum >= STRAIGHT_ANGLE
    ? [
        `The angles written at ${cornerList(written)} already add up to ${formatNumber(sum)}°, ` +
          `but a triangle's three angles add up to ${STRAIGHT_ANGLE}°.`,
      ]
    : [];
};

export const writtenValueConflicts = (figure: Figure): string[] => {
  const angles = figure.marks.filter(isWrittenAngle);
  return [
    ...figure.polygons.flatMap((entry) => polygonConflict(entry.vertices, angles)),
    ...sameRayConflicts(angles),
  ];
};

const lengthDescription = (entry: WrittenLength): string =>
  `${entry.from}${entry.to} = ${formatNumber(entry.value)}${entry.unit === undefined ? '' : ` ${entry.unit}`}`;

const lineName = ([from, to]: PointPair): string => `${from}${to}`;

const parallelConstraints = (lines: PointPair[], known: Set<string>): ParallelConstraint[] => {
  const drawn = lines.filter((line) => line.every((id) => known.has(id)));
  const [first, ...others] = drawn;
  return first === undefined
    ? []
    : others.map((second) => ({
        kind: 'parallel',
        lines: [first, second],
        description: `${lineName(first)} is parallel to ${lineName(second)}`,
      }));
};

const constraintFor = (entry: Mark, reference: WrittenLength | undefined, known: Set<string>): Constraint[] => {
  if (entry.kind === 'parallel') return parallelConstraints(entry.lines, known);
  if (entry.kind === 'right') {
    const name = angleName(entry.at, entry.from, entry.to);
    return [{ ...entry, kind: 'angle', degrees: RIGHT_ANGLE, description: `angle ${name} is a right angle` }];
  }
  if (isWrittenAngle(entry)) {
    const name = angleName(entry.at, entry.from, entry.to);
    return [{ ...entry, description: `angle ${name} = ${formatNumber(entry.degrees)}°` }];
  }
  if (isWrittenLength(entry) && reference !== undefined) {
    return [{ ...entry, reference, description: lengthDescription(entry) }];
  }
  return [];
};

const writtenConstraints = (figure: Figure): Constraint[] => {
  const reference = figure.marks.find(isWrittenLength);
  const known = new Set(figure.points.map(({ id }) => id));
  return figure.marks.flatMap((entry) => constraintFor(entry, reference, known));
};

const lengthBetween = (positions: Positions, from: string, to: string): number | null => {
  const [p, q] = [positions[from], positions[to]];
  return p && q ? distance(p, q) : null;
};

const targetLength = (positions: Positions, constraint: LengthConstraint): number | null => {
  const { reference } = constraint;
  const referenceLength = lengthBetween(positions, reference.from, reference.to);
  if (referenceLength === null || referenceLength < EPSILON || Math.abs(reference.value) < EPSILON) return null;
  return (constraint.value / reference.value) * referenceLength;
};

const angleError = (positions: Positions, constraint: AngleConstraint): number | null => {
  const [at, from, to] = [positions[constraint.at], positions[constraint.from], positions[constraint.to]];
  const current = at && from && to ? angleAt(at, from, to) : null;
  return current === null ? null : constraint.degrees - current;
};

const isSatisfied = (positions: Positions, constraint: Constraint): boolean => {
  if (constraint.kind === 'parallel') {
    const [first, second] = constraint.lines;
    return areParallel(positions, first, second, FIT_TOLERANCE_DEGREES) === true;
  }
  if (constraint.kind === 'angle') {
    const error = angleError(positions, constraint);
    return error !== null && Math.abs(error) <= FIT_TOLERANCE_DEGREES;
  }
  const target = targetLength(positions, constraint);
  const current = lengthBetween(positions, constraint.from, constraint.to);
  return target !== null && current !== null && Math.abs(current - target) <= FIT_TOLERANCE_FRACTION * target;
};

const turnAbout = (centre: Point, point: Point, degrees: number): Point => {
  const radians = degrees * RADIANS_PER_DEGREE;
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: centre.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
};

const openingSide = (at: Point, from: Point, to: Point): number => {
  const turn = (from.x - at.x) * (to.y - at.y) - (from.y - at.y) * (to.x - at.x);
  return turn < 0 ? -1 : 1;
};

const samePair = (a: PointPair, b: PointPair): boolean => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

const onLine = (crossings: Crossing[], id: string, line: PointPair): boolean =>
  line.includes(id) || crossings.some(({ point, lines }) => point === id && lines.some((entry) => samePair(entry, line)));

const armPoints = (crossings: Crossing[], at: string, arm: string): string[] => {
  const crossing = crossings.find(({ point }) => point === at);
  const line = crossing?.lines.find((entry) => onLine(crossings, arm, entry));
  return line ?? [arm];
};

const turned = (positions: Positions, centre: Point, ids: string[], degrees: number): Positions =>
  ids.reduce((next, id) => {
    const point = next[id];
    return point === undefined ? next : { ...next, [id]: turnAbout(centre, point, degrees) };
  }, positions);

const projectAngle = (positions: Positions, constraint: AngleConstraint, crossings: Crossing[]): Positions => {
  const [at, from, to] = [positions[constraint.at], positions[constraint.from], positions[constraint.to]];
  const error = angleError(positions, constraint);
  if (!at || !from || !to || error === null || constraint.from === constraint.to) return positions;
  const half = (openingSide(at, from, to) * error) / 2;
  const fromSide = turned(positions, at, armPoints(crossings, constraint.at, constraint.from), -half);
  return turned(fromSide, at, armPoints(crossings, constraint.at, constraint.to), half);
};

const direction = (positions: Positions, [from, to]: PointPair): number | null => {
  const [a, b] = [positions[from], positions[to]];
  return a && b && distance(a, b) > EPSILON ? Math.atan2(b.y - a.y, b.x - a.x) / RADIANS_PER_DEGREE : null;
};

const towardsParallel = (degrees: number): number => {
  const turn = ((degrees % STRAIGHT_ANGLE) + STRAIGHT_ANGLE) % STRAIGHT_ANGLE;
  return turn > RIGHT_ANGLE ? turn - STRAIGHT_ANGLE : turn;
};

const projectParallel = (positions: Positions, constraint: ParallelConstraint): Positions => {
  const [first, second] = constraint.lines;
  const [target, current] = [direction(positions, first), direction(positions, second)];
  const [a, b] = [positions[second[0]], positions[second[1]]];
  if (target === null || current === null || !a || !b) return positions;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return turned(positions, middle, second, towardsParallel(target - current));
};

const projectLength = (positions: Positions, constraint: LengthConstraint): Positions => {
  const [from, to] = [positions[constraint.from], positions[constraint.to]];
  const target = targetLength(positions, constraint);
  if (!from || !to || target === null) return positions;
  const current = distance(from, to);
  if (current < EPSILON) return positions;
  const half = (target - current) / 2;
  const ux = (to.x - from.x) / current;
  const uy = (to.y - from.y) / current;
  return {
    ...positions,
    [constraint.from]: { x: from.x - ux * half, y: from.y - uy * half },
    [constraint.to]: { x: to.x + ux * half, y: to.y + uy * half },
  };
};

const projectOne = (positions: Positions, constraint: Constraint, crossings: Crossing[]): Positions => {
  switch (constraint.kind) {
    case 'angle':
      return projectAngle(positions, constraint, crossings);
    case 'length':
      return projectLength(positions, constraint);
    case 'parallel':
      return projectParallel(positions, constraint);
  }
};

type Crossed = { crossings: Crossing[]; drawing: Figure['drawing'] };

const project =
  ({ crossings, drawing }: Crossed) =>
  (positions: Positions, constraint: Constraint): Positions =>
    placeCrossings(projectOne(positions, constraint, crossings), crossings, drawing);

const allSatisfied = (positions: Positions, constraints: Constraint[], { crossings, drawing }: Crossed): boolean =>
  crossingsInPlace(positions, crossings, drawing) && constraints.every((constraint) => isSatisfied(positions, constraint));

const withPositions = (figure: Figure, positions: Positions): Figure => ({
  ...figure,
  points: figure.points.map((entry) => ({ ...entry, ...positions[entry.id] })),
});

const unreachableMessage = (constraints: Constraint[]): string =>
  `These written values can't all hold at once: ${listOf(constraints.map(({ description }) => description))}.`;

const settle = (start: Positions, constraints: Constraint[], crossed: Crossed): Positions | null => {
  let positions = placeCrossings(start, crossed.crossings, crossed.drawing);
  if (allSatisfied(positions, constraints, crossed)) return positions;
  for (let pass = 0; pass < FIT_ITERATIONS; pass += 1) {
    positions = constraints.reduce(project(crossed), positions);
    if (allSatisfied(positions, constraints, crossed)) return positions;
  }
  return null;
};

export const fitWrittenValues = (figure: Figure): FitResult => {
  const conflicts = writtenValueConflicts(figure);
  if (conflicts.length > 0) return { ok: false, conflicts };
  const constraints = writtenConstraints(figure);
  const crossed: Crossed = { crossings: crossingsOf(figure), drawing: figure.drawing };
  const start = positionsOf(figure);
  if (allSatisfied(start, constraints, crossed)) return { ok: true, figure };
  const settled = settle(start, constraints, crossed);
  return settled === null
    ? { ok: false, conflicts: [unreachableMessage(constraints)] }
    : { ok: true, figure: withPositions(figure, settled) };
};

export const fittedOrDrawn = (figure: Figure): Figure => {
  const fitted = fitWrittenValues(figure);
  return fitted.ok ? fitted.figure : figure;
};
