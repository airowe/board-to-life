import type { Scene, SceneItem } from '../scene/schema';

type Point = { x: number; y: number };
type Jitter = (amount: number) => number;

const INK = '#1d2433';
const MARKER = '#1f4fbf';
const RED = '#c0392b';
const ORANGE = '#d68910';
const ARROW_LENGTH = 80;
const SCRIBBLE_TURNS = 7;

const seededJitter = (seed: number): Jitter => {
  let state = seed;
  return (amount) => {
    state = (state * 16807) % 2147483647;
    return ((state - 1) / 2147483646 - 0.5) * amount;
  };
};

const pathOf = (points: Point[]): string => `M${points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;

const wobblyLine = (jitter: Jitter, from: Point, to: Point, wobble = 3): string => {
  const segments = Math.max(4, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 40));
  return pathOf(
    Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments;
      const edge = i === 0 || i === segments ? 0.6 : 1;
      return { x: from.x + (to.x - from.x) * t + jitter(wobble * edge), y: from.y + (to.y - from.y) * t + jitter(wobble * edge) };
    }),
  );
};

const wobblyCircle = (jitter: Jitter, centre: Point, radius: number): string => {
  const steps = 28;
  return pathOf(
    Array.from({ length: steps + 2 }, (_, i) => {
      const angle = (i / steps) * Math.PI * 2 - 0.3;
      const r = radius + jitter(3);
      return { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r };
    }),
  );
};

const corners = (centre: Point, width: number, height: number, angle: number): Point[] => {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sy = 0]) => {
    const [dx, dy] = [(sx * width) / 2, (sy * height) / 2];
    return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
  });
};

const wobblyPolygon = (jitter: Jitter, points: Point[]): string =>
  points.map((point, i) => wobblyLine(jitter, point, points[(i + 1) % points.length] ?? point, 2)).join(' ');

const stroke = (d: string, colour: string, width: number, data: string): string =>
  `<path ${data} d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`;

const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const centreOf = (item: SceneItem | undefined): Point | null =>
  item && 'x' in item && 'y' in item ? { x: item.x, y: item.y } : null;

const radiusOf = (item: SceneItem | undefined): number => (item && 'radius' in item ? item.radius : 0);

const towards = (from: Point, to: Point, distance: number): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
};

const itemPath =(jitter: Jitter, item: SceneItem, byId: Map<string, SceneItem>): string => {
  switch (item.kind) {
    case 'ball':
      return wobblyCircle(jitter, item, item.radius);
    case 'block':
    case 'domino':
    case 'lever':
      return wobblyPolygon(jitter, corners(item, item.width, item.height, item.angle));
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
    case 'rope': {
      const [fromItem, toItem] = [byId.get(item.from), byId.get(item.to)];
      const [from, to] = [centreOf(fromItem), centreOf(toItem)];
      if (!from || !to) return '';
      return wobblyLine(jitter, towards(from, to, radiusOf(fromItem)), towards(to, from, radiusOf(toItem)), 2);
    }
  }
};

const itemColour = (item: SceneItem): string => (item.kind === 'ball' ? MARKER : INK);
const itemWidth = (item: SceneItem): number => (item.kind === 'rope' ? 4 : item.kind === 'floor' || item.kind === 'ramp' ? 7 : 5);

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
  return stroke(d, RED, 5, `data-arrow="${item.id}"`);
};

const scribble = (jitter: Jitter, mark: Scene['unknownMarks'][number]): string => {
  const points = Array.from({ length: SCRIBBLE_TURNS * 2 + 1 }, (_, i) => ({
    x: mark.x - mark.width / 2 + (mark.width * i) / (SCRIBBLE_TURNS * 2) + jitter(4),
    y: mark.y + (i % 2 === 0 ? -1 : 1) * (mark.height / 2 - 8) + jitter(6),
  }));
  return stroke(pathOf(points), ORANGE, 4, `data-mark="${mark.id}"`);
};

const label = (entry: Scene['labels'][number]): string =>
  `<text x="${entry.x}" y="${entry.y}" fill="${INK}" font-family="Marker Felt, Comic Sans MS, cursive" font-size="34">${escapeText(entry.text)}</text>`;

export const sketchScene = (scene: Scene, seed: number): string => {
  const jitter = seededJitter(seed);
  const byId = new Map(scene.items.map((item) => [item.id, item]));
  const { width, height } = scene.drawing;
  const parts = [
    ...scene.items.map((item) => stroke(itemPath(jitter, item, byId), itemColour(item), itemWidth(item), `data-item="${item.id}"`)),
    ...scene.items.flatMap((item) => arrow(jitter, item) ?? []),
    ...scene.unknownMarks.map((mark) => scribble(jitter, mark)),
    ...scene.labels.map(label),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <radialGradient id="board" cx="45%" cy="40%" r="80%">
      <stop offset="0" stop-color="#fbfbf8"/>
      <stop offset="0.7" stop-color="#eeeeea"/>
      <stop offset="1" stop-color="#d9d9d3"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#board)"/>
  ${parts.join('\n  ')}
</svg>
`;
};
