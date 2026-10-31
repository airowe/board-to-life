import { isLink, type Scene, type SceneItem } from '../scene/schema';
import { cartWheels } from '../scene/cart';
import { linkPoints } from '../scene/linkPoints';
import {
  GHOST,
  INK,
  LABEL_FONT,
  MARKER,
  ORANGE,
  RED,
  boardBackground,
  corners,
  escapeText,
  pathOf,
  scribblePath,
  seededJitter,
  stroke,
  towards,
  wobblyCircle,
  wobblyLine,
  wobblyPolygon,
  type Jitter,
  type Point,
} from './ink';

const GHOST_OFFSET = { x: 23, y: -14 };
const GHOST_SEED_SHIFT = 101;
const ARROW_LENGTH = 80;
const HATCH_SPACING = 14;

const centreOf = (item: SceneItem | undefined): Point | null =>
  item && 'x' in item && 'y' in item ? { x: item.x, y: item.y } : null;

const radiusOf = (item: SceneItem | undefined): number => (item && 'radius' in item ? item.radius : 0);

const itemPath =(jitter: Jitter, item: SceneItem, byId: Map<string, SceneItem>): string => {
  switch (item.kind) {
    case 'ball':
      return wobblyCircle(jitter, item, item.radius);
    case 'block':
    case 'domino':
    case 'lever':
      return wobblyPolygon(jitter, corners(item, item.width, item.height, item.angle));
    case 'cart':
      return [wobblyPolygon(jitter, corners(item, item.width, item.height, item.angle)), ...cartWheels(item).map((wheel) => wobblyCircle(jitter, wheel, item.wheelRadius))].join(' ');
    case 'wall':
      return wobblyPolygon(jitter, corners(item, item.width, item.height, 0));
    case 'floor': {
      const top = item.y - item.height / 2;
      return wobblyLine(jitter, { x: item.x - item.width / 2 + 20, y: top }, { x: item.x + item.width / 2 - 20, y: top }, 4);
    }
    case 'ramp':
      return wobblyLine(jitter, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }, 4);
    case 'pivot':
      return wobblyPolygon(jitter, [item, { x: item.x + 16, y: item.y + 26 }, { x: item.x - 16, y: item.y + 26 }]);
    case 'pulley':
      return `${wobblyCircle(jitter, item, item.radius)} ${wobblyCircle(jitter, item, 2)}`;
    case 'rope':
    case 'spring': {
      // Start and end at the edge of what the link joins, not its centre.
      const [fromItem, toItem] = [byId.get(item.from), byId.get(item.to)];
      const [from, to] = [centreOf(fromItem), centreOf(toItem)];
      const over = item.kind === 'rope' && item.over !== undefined ? centreOf(byId.get(item.over)) : null;
      if (!from || !to) return '';
      const ends = new Map([
        [item.from, towards(from, over ?? to, radiusOf(fromItem))],
        [item.to, towards(to, over ?? from, radiusOf(toItem))],
      ]);
      const points = linkPoints(item, (id) => ends.get(id) ?? centreOf(byId.get(id)));
      if (item.kind === 'spring') return pathOf(points.map((point) => ({ x: point.x + jitter(2), y: point.y + jitter(2) })));
      return points.slice(1).map((point, index) => wobblyLine(jitter, points[index] ?? point, point, 2)).join(' ');
    }
  }
};

const itemColour = (item: SceneItem): string => (item.kind === 'ball' ? MARKER : INK);
const itemWidth = (item: SceneItem): number => (isLink(item) ? 4 : item.kind === 'floor' || item.kind === 'ramp' ? 7 : 5);

const arrow = (jitter: Jitter, item: SceneItem): string | null => {
  if (!('velocity' in item) || !item.velocity) return null;
  const speed = Math.hypot(item.velocity.x, item.velocity.y);
  if (speed === 0) return null;
  const [ux, uy] = [item.velocity.x / speed, item.velocity.y / speed];
  const clearance = ('radius' in item ? item.radius : 30) + 16;
  const start = { x: item.x + ux * clearance, y: item.y + uy * clearance - 42 };
  const tip = { x: start.x + ux * ARROW_LENGTH, y: start.y + uy * ARROW_LENGTH };
  const barb = (side: number): Point => ({ x: tip.x - ux * 20 - uy * 12 * side, y: tip.y - uy * 20 + ux * 12 * side });
  const d = [wobblyLine(jitter, start, tip, 2), wobblyLine(jitter, barb(1), tip, 1), wobblyLine(jitter, barb(-1), tip, 1)].join(' ');
  return stroke(d, RED, 5, `data-arrow="${escapeText(item.id)}"`);
};

// The board legend: fixed things are hatched, so a wall never reads as a domino.
const hatch = (jitter: Jitter, item: SceneItem): string | null => {
  if (item.kind !== 'wall') return null;
  const [left, right, top, bottom] = [item.x - item.width / 2, item.x + item.width / 2, item.y - item.height / 2, item.y + item.height / 2];
  const lines: string[] = [];
  for (let k = left - bottom + HATCH_SPACING; k < right - top; k += HATCH_SPACING) {
    const [y1, y2] = [Math.max(top, left - k), Math.min(bottom, right - k)];
    if (y2 - y1 > 2) lines.push(wobblyLine(jitter, { x: y1 + k, y: y1 }, { x: y2 + k, y: y2 }, 1));
  }
  return stroke(lines.join(' '), INK, 3, `data-hatch="${escapeText(item.id)}"`);
};

const scribble = (jitter: Jitter, mark: Scene['unknownMarks'][number]): string =>
  stroke(scribblePath(jitter, mark), ORANGE, 4, `data-mark="${escapeText(mark.id)}"`);

const label = (entry: Scene['labels'][number]): string =>
  `<text x="${entry.x}" y="${entry.y}" fill="${INK}" font-family="${LABEL_FONT}" font-size="34">${escapeText(entry.text)}</text>`;

// Marker that was wiped off but not cleaned: faint, smeared, slightly off from where it was.
const ghostStrokes = (ghost: Scene, seed: number): string[] => {
  const jitter = seededJitter(seed + GHOST_SEED_SHIFT);
  const byId = new Map(ghost.items.map((item) => [item.id, item]));
  return ghost.items.map(
    (item) =>
      `<g transform="translate(${GHOST_OFFSET.x} ${GHOST_OFFSET.y})">${stroke(itemPath(jitter, item, byId), GHOST, 9, `data-ghost="${item.id}"`, 0.16)}</g>`,
  );
};

export const sketchScene = (scene: Scene, seed: number, ghost?: Scene): string => {
  const jitter = seededJitter(seed);
  const byId = new Map(scene.items.map((item) => [item.id, item]));
  const { width, height } = scene.drawing;
  const parts = [
    ...(ghost ? ghostStrokes(ghost, seed) : []),
    ...scene.items.map((item) => stroke(itemPath(jitter, item, byId), itemColour(item), itemWidth(item), `data-item="${escapeText(item.id)}"`)),
    ...scene.items.flatMap((item) => hatch(jitter, item) ?? []),
    ...scene.items.flatMap((item) => arrow(jitter, item) ?? []),
    ...scene.unknownMarks.map((mark) => scribble(jitter, mark)),
    ...scene.labels.map(label),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${boardBackground(width, height)}
  ${parts.join('\n  ')}
</svg>
`;
};
