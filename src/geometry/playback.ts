import type { GeometryLesson } from '../session/store';
import { angleAt, areParallel, displayLength, polygonAngles, positionsOf, transformAt, type Point, type Positions } from './derive';
import { clampToDrawing } from './edits';
import { followCrossings } from './focus';
import type { GeometryQuestion } from './questions';
import type { Figure, Focus, Mark, Polygon, Transformation } from './schema';

export const TRANSFORM_SECONDS = 2;
export const PARALLEL_TOLERANCE_DEGREES = 1;
export const NOT_PARALLEL_TEXT = 'Not parallel now';

const LENGTH_DECIMALS = 1;
const ORIGIN: Point = { x: 0, y: 0 };

export type FigurePhase =
  | { kind: 'ready' }
  | { kind: 'predict'; question: GeometryQuestion }
  | { kind: 'guessing' }
  | { kind: 'playing'; t: number }
  | { kind: 'exploring' };

export type Readout = { id: string; text: string; at: Point };

export type FigurePlayback = {
  phase: () => FigurePhase;
  positions: () => Positions;
  ghostOffset: () => Point;
  previousImage: () => Positions | null;
  play: () => void;
  answer: () => void;
  reveal: () => void;
  tick: (seconds: number) => void;
  dragPoint: (id: string, to: Point) => void;
  dragGhost: (delta: Point) => void;
  replay: () => void;
};

type Move = { transformation: Transformation; polygon: Polygon };

const moveOf = (figure: Figure, focus: Focus | null): Move | null => {
  if (focus?.kind !== 'transform') return null;
  const transformation = figure.transformations.find((entry) => entry.id === focus.transformation);
  const polygon = transformation && figure.polygons.find((entry) => entry.id === transformation.polygon);
  return transformation && polygon ? { transformation, polygon } : null;
};

const shifted = (positions: Positions, by: Point): Positions =>
  Object.fromEntries(Object.entries(positions).map(([id, at]) => [id, { x: at.x + by.x, y: at.y + by.y }]));

export const createFigurePlayback = (lesson: GeometryLesson): FigurePlayback => {
  const { figure } = lesson;
  const question: GeometryQuestion | null = lesson.questions[0] ?? null;
  const focus: Focus | null = question?.observe.focus ?? null;
  const move = moveOf(figure, focus);

  let base = positionsOf(figure);
  let phase: FigurePhase = { kind: 'ready' };
  let ghost = ORIGIN;
  let previous: Positions | null = null;
  let played: Positions | null = null;

  const imageAt = (t: number): Positions => (move ? transformAt(base, move.transformation, t, move.polygon) : {});

  const positions = (): Positions => {
    switch (phase.kind) {
      case 'guessing':
        return { ...base, ...shifted(imageAt(0), ghost) };
      case 'playing':
        return { ...base, ...imageAt(phase.t) };
      case 'exploring':
        return { ...base, ...imageAt(1) };
      default:
        return base;
    }
  };

  const startAfterQuestion = (): FigurePhase => (move ? { kind: 'guessing' } : { kind: 'exploring' });

  return {
    phase: () => phase,
    positions,
    ghostOffset: () => ghost,
    previousImage: () => previous,
    play: () => {
      if (phase.kind === 'ready') phase = question ? { kind: 'predict', question } : startAfterQuestion();
    },
    answer: () => {
      if (phase.kind === 'predict') phase = startAfterQuestion();
    },
    reveal: () => {
      if (phase.kind !== 'guessing') return;
      played = imageAt(1);
      phase = { kind: 'playing', t: 0 };
    },
    tick: (seconds) => {
      if (phase.kind !== 'playing') return;
      const t = Math.min(1, phase.t + seconds / TRANSFORM_SECONDS);
      phase = t >= 1 ? { kind: 'exploring' } : { kind: 'playing', t };
    },
    dragPoint: (id, to) => {
      if (phase.kind !== 'exploring' || base[id] === undefined) return;
      const moved = { ...base, [id]: clampToDrawing(figure, to) };
      base = focus?.kind === 'equal-angles' ? followCrossings(moved, figure, focus.marks) : moved;
    },
    dragGhost: (delta) => {
      if (phase.kind === 'guessing') ghost = { x: ghost.x + delta.x, y: ghost.y + delta.y };
    },
    replay: () => {
      previous = played;
      ghost = ORIGIN;
      phase = { kind: 'ready' };
    },
  };
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const centroid = (points: Point[]): Point => ({
  x: points.reduce((sum, entry) => sum + entry.x, 0) / points.length,
  y: points.reduce((sum, entry) => sum + entry.y, 0) / points.length,
});

const lengthText = (value: number, unit: string | null): string => {
  const number = value.toFixed(LENGTH_DECIMALS);
  return unit === null ? number : `${number} ${unit}`;
};

const markReadouts = (figure: Figure, positions: Positions, mark: Mark): Readout[] => {
  switch (mark.kind) {
    case 'angle': {
      const [at, from, to] = [positions[mark.at], positions[mark.from], positions[mark.to]];
      const degrees = at && from && to ? angleAt(at, from, to) : null;
      return at && degrees !== null ? [{ id: mark.id, text: `${Math.round(degrees)}°`, at }] : [];
    }
    case 'length': {
      const [from, to] = [positions[mark.from], positions[mark.to]];
      if (!from || !to) return [];
      const { value, unit } = displayLength(figure, positions, mark.from, mark.to);
      return [{ id: mark.id, text: lengthText(value, unit), at: midpoint(from, to) }];
    }
    case 'parallel': {
      const [first, second] = mark.lines;
      const parallel = first && second ? areParallel(positions, first, second, PARALLEL_TOLERANCE_DEGREES) : null;
      const anchor = first && positions[first[0]];
      return parallel === false && anchor ? [{ id: mark.id, text: NOT_PARALLEL_TEXT, at: anchor }] : [];
    }
    default:
      return [];
  }
};

const angleSumReadout = (positions: Positions, polygon: Polygon): Readout[] => {
  const angles = polygonAngles(positions, polygon);
  const corners = polygon.vertices.map((id) => positions[id]);
  if (angles.some((entry) => entry === null) || !corners.every((entry): entry is Point => entry !== undefined)) return [];
  const total = Math.round((angles as number[]).reduce((sum, entry) => sum + entry, 0));
  return [{ id: polygon.id, text: `${polygon.vertices.join(' + ')} = ${total}°`, at: centroid(corners) }];
};

export const liveReadouts = (figure: Figure, positions: Positions): Readout[] => [
  ...figure.marks.flatMap((mark) => markReadouts(figure, positions, mark)),
  ...figure.polygons.flatMap((polygon) => angleSumReadout(positions, polygon)),
];
