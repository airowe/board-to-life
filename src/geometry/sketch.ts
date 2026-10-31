import {
  GHOST,
  INK,
  LABEL_FONT,
  MARKER,
  ORANGE,
  RED,
  boardBackground,
  escapeText,
  pathOf,
  scribblePath,
  seededJitter,
  stroke,
  towards,
  wobblyCircle,
  wobblyLine,
  type Jitter,
  type Point,
} from '../checks/ink';
import { positionsOf, screenSweepRadians, type Positions } from './derive';
import type { Figure, Mark, Polygon, Segment, Transformation } from './schema';

const LETTER_SIZE = 36;
const LABEL_SIZE = 34;
const VALUE_SIZE = 28;
const LETTER_OFFSET = 34;
const LETTER_BASELINE_SHIFT = 10;
const UNNAMED_POINT = /^P\d+$/;
const LINE_WIDTH = 5;
const MARK_WIDTH = 4;
const ARC_RADIUS = 48;
const ARC_STEPS = 16;
const VALUE_REACH = 24;
const RIGHT_SIDE = 30;
const TICK_LENGTH = 22;
const TICK_GAP = 12;
const CHEVRON_LENGTH = 20;
const CHEVRON_SPREAD = 11;
const LINE_REACH = 150;
const MIRROR_DASH = '16 11';
const TURN_RADIUS = 70;
const TURN_STEPS = 24;
const ARROWHEAD_LENGTH = 24;
const ARROWHEAD_SPREAD = 13;
const CENTRE_DOT = 7;

const text = (x: number, y: number, size: number, content: string, data: string, anchor = 'start'): string =>
  `<text ${data} x="${x}" y="${y}" text-anchor="${anchor}" fill="${INK}" font-family="${LABEL_FONT}" font-size="${size}">${escapeText(content)}</text>`;

const dataAttr = (name: string, value: string): string => `data-${name}="${escapeText(value)}"`;

const at = (positions: Positions, id: string): Point => positions[id] ?? { x: 0, y: 0 };

const offset = (from: Point, direction: Point, distance: number): Point => ({ x: from.x + direction.x * distance, y: from.y + direction.y * distance });

const unit = (from: Point, to: Point): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

const arrowhead = (jitter: Jitter, from: Point, tip: Point): string => {
  const { x: ux, y: uy } = unit(from, tip);
  const barb = (side: number): Point => ({ x: tip.x - ux * ARROWHEAD_LENGTH - uy * ARROWHEAD_SPREAD * side, y: tip.y - uy * ARROWHEAD_LENGTH + ux * ARROWHEAD_SPREAD * side });
  return [wobblyLine(jitter, barb(1), tip, 1), wobblyLine(jitter, barb(-1), tip, 1)].join(' ');
};

const arcPoints = (centre: Point, radius: number, start: number, sweep: number, steps: number): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const heading = start + (sweep * i) / steps;
    return { x: centre.x + Math.cos(heading) * radius, y: centre.y + Math.sin(heading) * radius };
  });

const headingOf = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);

const shortestSweep = (start: number, end: number): number => {
  const raw = (end - start) % (Math.PI * 2);
  if (raw > Math.PI) return raw - Math.PI * 2;
  if (raw < -Math.PI) return raw + Math.PI * 2;
  return raw;
};

const extended = (positions: Positions, entry: Segment, past: 'both' | 'to'): [Point, Point] => {
  const [from, to] = [at(positions, entry.from), at(positions, entry.to)];
  const reach = Math.hypot(to.x - from.x, to.y - from.y) + LINE_REACH;
  return [past === 'both' ? towards(to, from, reach) : from, towards(from, to, reach)];
};

const segmentPath = (jitter: Jitter, positions: Positions, entry: Segment): string =>
  stroke(wobblyLine(jitter, at(positions, entry.from), at(positions, entry.to)), INK, LINE_WIDTH, dataAttr('segment', entry.id));

const lineLike = (jitter: Jitter, positions: Positions, entry: Segment, kind: 'line' | 'ray'): string => {
  const [start, end] = extended(positions, entry, kind === 'line' ? 'both' : 'to');
  return stroke(wobblyLine(jitter, start, end), INK, LINE_WIDTH, dataAttr(kind, entry.id));
};

const circlePath = (jitter: Jitter, positions: Positions, entry: Figure['circles'][number]): string => {
  const centre = at(positions, entry.centre);
  const through = at(positions, entry.through ?? entry.centre);
  const radius = entry.radius ?? Math.hypot(through.x - centre.x, through.y - centre.y);
  return stroke(wobblyCircle(jitter, centre, radius), INK, LINE_WIDTH, dataAttr('circle', entry.id));
};

const edgePaths = (jitter: Jitter, positions: Positions, entry: Polygon): string[] =>
  entry.vertices.map((vertex, i) => {
    const next = entry.vertices[(i + 1) % entry.vertices.length] ?? vertex;
    return stroke(wobblyLine(jitter, at(positions, vertex), at(positions, next)), INK, LINE_WIDTH, dataAttr('edge', `${entry.id}-${i}`));
  });

const hasLabelText = (figure: Figure, content: string): boolean => figure.labels.some((entry) => entry.text === content);

const angleMark = (jitter: Jitter, figure: Figure, positions: Positions, entry: Extract<Mark, { kind: 'angle' }>): string[] => {
  const [vertex, from, to] = [at(positions, entry.at), at(positions, entry.from), at(positions, entry.to)];
  const [start, end] = [headingOf(vertex, from), headingOf(vertex, to)];
  const sweep = shortestSweep(start, end);
  const arc = arcPoints(vertex, ARC_RADIUS, start, sweep, ARC_STEPS).map((p) => ({ x: p.x + jitter(2), y: p.y + jitter(2) }));
  const parts = [stroke(pathOf(arc), MARKER, MARK_WIDTH, dataAttr('angle', entry.id))];
  const value = entry.degrees === undefined ? undefined : `${entry.degrees}°`;
  if (value !== undefined && !hasLabelText(figure, value)) {
    const heading = start + sweep / 2;
    const spot = { x: vertex.x + Math.cos(heading) * (ARC_RADIUS + VALUE_REACH), y: vertex.y + Math.sin(heading) * (ARC_RADIUS + VALUE_REACH) };
    parts.push(text(Math.round(spot.x), Math.round(spot.y + LETTER_BASELINE_SHIFT), VALUE_SIZE, value, dataAttr('angle-value', entry.id), 'middle'));
  }
  return parts;
};

const rightMark = (jitter: Jitter, positions: Positions, entry: Extract<Mark, { kind: 'right' }>): string => {
  const vertex = at(positions, entry.at);
  const [a, b] = [unit(vertex, at(positions, entry.from)), unit(vertex, at(positions, entry.to))];
  const [p, q] = [offset(vertex, a, RIGHT_SIDE), offset(vertex, b, RIGHT_SIDE)];
  const corner = offset(p, b, RIGHT_SIDE);
  return stroke(`${wobblyLine(jitter, p, corner, 1)} ${wobblyLine(jitter, corner, q, 1)}`, MARKER, MARK_WIDTH, dataAttr('right', entry.id));
};

const perpendicular = (direction: Point): Point => ({ x: -direction.y, y: direction.x });

const tickMarks = (jitter: Jitter, positions: Positions, entry: Extract<Mark, { kind: 'equal' }>): string[] =>
  entry.segments.flatMap(([from, to], segmentIndex) => {
    const [p, q] = [at(positions, from), at(positions, to)];
    const [direction, centre] = [unit(p, q), midpoint(p, q)];
    const normal = perpendicular(direction);
    return Array.from({ length: entry.ticks }, (_, i) => {
      const along = offset(centre, direction, (i - (entry.ticks - 1) / 2) * TICK_GAP);
      return stroke(
        wobblyLine(jitter, offset(along, normal, -TICK_LENGTH / 2), offset(along, normal, TICK_LENGTH / 2), 1),
        MARKER,
        MARK_WIDTH,
        dataAttr('tick', `${entry.id}-${segmentIndex}-${i}`),
      );
    });
  });

const chevron = (jitter: Jitter, positions: Positions, entry: Extract<Mark, { kind: 'parallel' }>): string[] =>
  entry.lines.map(([from, to], i) => {
    const [p, q] = [at(positions, from), at(positions, to)];
    const direction = unit(p, q);
    const tip = offset(midpoint(p, q), direction, CHEVRON_LENGTH / 2);
    const back = offset(tip, direction, -CHEVRON_LENGTH);
    const normal = perpendicular(direction);
    const d = `${wobblyLine(jitter, offset(back, normal, CHEVRON_SPREAD), tip, 1)} ${wobblyLine(jitter, offset(back, normal, -CHEVRON_SPREAD), tip, 1)}`;
    return stroke(d, MARKER, MARK_WIDTH, dataAttr('parallel', `${entry.id}-${i}`));
  });

const markParts = (jitter: Jitter, figure: Figure, positions: Positions): string[] =>
  figure.marks.flatMap((entry) => {
    switch (entry.kind) {
      case 'angle':
        return angleMark(jitter, figure, positions, entry);
      case 'right':
        return [rightMark(jitter, positions, entry)];
      case 'equal':
        return tickMarks(jitter, positions, entry);
      case 'parallel':
        return chevron(jitter, positions, entry);
      case 'length':
        return [];
    }
  });

const centreCross = (centre: Point, id: string): string =>
  stroke(`M${centre.x - CENTRE_DOT},${centre.y} L${centre.x + CENTRE_DOT},${centre.y} M${centre.x},${centre.y - CENTRE_DOT} L${centre.x},${centre.y + CENTRE_DOT}`, RED, MARK_WIDTH, dataAttr('centre', id));

const reflectParts = (jitter: Jitter, positions: Positions, entry: Extract<Transformation, { kind: 'reflect' }>): string[] => {
  const [p, q] = [at(positions, entry.mirror[0]), at(positions, entry.mirror[1])];
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  const [start, end] = [towards(q, p, length + LINE_REACH), towards(p, q, length + LINE_REACH)];
  return [stroke(wobblyLine(jitter, start, end), ORANGE, MARK_WIDTH, `${dataAttr('mirror', entry.id)} stroke-dasharray="${MIRROR_DASH}"`)];
};

const rotateParts = (jitter: Jitter, figure: Figure, positions: Positions, entry: Extract<Transformation, { kind: 'rotate' }>): string[] => {
  const centre = at(positions, entry.centre);
  const polygon = figure.polygons.find((candidate) => candidate.id === entry.polygon);
  const first = at(positions, polygon?.vertices[0] ?? entry.centre);
  const start = headingOf(centre, first);
  const sweep = screenSweepRadians(entry.degrees);
  const arc = arcPoints(centre, TURN_RADIUS, start, sweep, TURN_STEPS);
  const [beforeTip, tip] = [arc[arc.length - 2] ?? centre, arc[arc.length - 1] ?? centre];
  const middle = start + sweep / 2;
  const valueSpot = { x: centre.x + Math.cos(middle) * (TURN_RADIUS + VALUE_REACH), y: centre.y + Math.sin(middle) * (TURN_RADIUS + VALUE_REACH) };
  return [
    centreCross(centre, entry.id),
    stroke(`${pathOf(arc)} ${arrowhead(jitter, beforeTip, tip)}`, RED, MARK_WIDTH, dataAttr('turn', entry.id)),
    text(Math.round(valueSpot.x), Math.round(valueSpot.y + LETTER_BASELINE_SHIFT), VALUE_SIZE, `${entry.degrees}°`, dataAttr('turn-value', entry.id), 'middle'),
  ];
};

const translateParts = (jitter: Jitter, positions: Positions, entry: Extract<Transformation, { kind: 'translate' }>): string[] => {
  const [from, to] = [at(positions, entry.from), at(positions, entry.to)];
  return [stroke(`${wobblyLine(jitter, from, to, 3)} ${arrowhead(jitter, from, to)}`, RED, MARK_WIDTH, dataAttr('translate', entry.id))];
};

const dilateParts = (positions: Positions, entry: Extract<Transformation, { kind: 'dilate' }>): string[] => {
  const centre = at(positions, entry.centre);
  return [centreCross(centre, entry.id)];
};

const transformationParts = (jitter: Jitter, figure: Figure, positions: Positions): string[] =>
  figure.transformations.flatMap((entry) => {
    switch (entry.kind) {
      case 'reflect':
        return reflectParts(jitter, positions, entry);
      case 'rotate':
        return rotateParts(jitter, figure, positions, entry);
      case 'translate':
        return translateParts(jitter, positions, entry);
      case 'dilate':
        return dilateParts(positions, entry);
    }
  });

const centroid = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / (points.length || 1),
  y: points.reduce((sum, p) => sum + p.y, 0) / (points.length || 1),
});

const pointLetters = (figure: Figure, positions: Positions): string[] => {
  const middle = centroid(Object.values(positions));
  return figure.points
    .filter((entry) => !UNNAMED_POINT.test(entry.id) && !hasLabelText(figure, entry.id))
    .map((entry) => {
      const direction = unit(middle, entry);
      const spot = offset(entry, direction, LETTER_OFFSET);
      return text(Math.round(spot.x), Math.round(spot.y + LETTER_BASELINE_SHIFT), LETTER_SIZE, entry.id, dataAttr('point-letter', entry.id), 'middle');
    });
};

const scribble = (jitter: Jitter, mark: Figure['unknownMarks'][number]): string => stroke(scribblePath(jitter, mark), GHOST, MARK_WIDTH, dataAttr('unknown', mark.id));

export const sketchFigure = (figure: Figure, seed: number): string => {
  const jitter = seededJitter(seed);
  const positions = positionsOf(figure);
  const { width, height } = figure.drawing;
  const parts = [
    ...figure.segments.map((entry) => segmentPath(jitter, positions, entry)),
    ...figure.lines.map((entry) => lineLike(jitter, positions, entry, 'line')),
    ...figure.rays.map((entry) => lineLike(jitter, positions, entry, 'ray')),
    ...figure.circles.map((entry) => circlePath(jitter, positions, entry)),
    ...figure.polygons.flatMap((entry) => edgePaths(jitter, positions, entry)),
    ...markParts(jitter, figure, positions),
    ...transformationParts(jitter, figure, positions),
    ...figure.unknownMarks.map((entry) => scribble(jitter, entry)),
    ...pointLetters(figure, positions),
    ...figure.labels.map((entry) => text(entry.x, entry.y, LABEL_SIZE, entry.text, dataAttr('label', entry.id))),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${boardBackground(width, height)}
  ${parts.join('\n  ')}
</svg>
`;
};
