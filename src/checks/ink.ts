export type Point = { x: number; y: number };
export type Jitter = (amount: number) => number;

export const INK = '#1d2433';
export const MARKER = '#1f4fbf';
export const RED = '#c0392b';
export const ORANGE = '#d68910';
export const GHOST = '#8a8f99';
export const LABEL_FONT = 'Marker Felt, Comic Sans MS, cursive';
const SPIRAL_TURNS = 3;
const SPIRAL_STEPS = 60;

export const seededJitter = (seed: number): Jitter => {
  let state = seed;
  return (amount) => {
    state = (state * 16807) % 2147483647;
    return ((state - 1) / 2147483646 - 0.5) * amount;
  };
};

export const pathOf = (points: Point[]): string => `M${points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;

export const wobblyLine = (jitter: Jitter, from: Point, to: Point, wobble = 3): string => {
  const segments = Math.max(4, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 40));
  return pathOf(
    Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments;
      const edge = i === 0 || i === segments ? 0.6 : 1;
      return { x: from.x + (to.x - from.x) * t + jitter(wobble * edge), y: from.y + (to.y - from.y) * t + jitter(wobble * edge) };
    }),
  );
};

export const wobblyCircle = (jitter: Jitter, centre: Point, radius: number): string => {
  const steps = 28;
  return pathOf(
    Array.from({ length: steps + 2 }, (_, i) => {
      const angle = (i / steps) * Math.PI * 2 - 0.3;
      const r = radius + jitter(3);
      return { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r };
    }),
  );
};

export const corners = (centre: Point, width: number, height: number, angle: number): Point[] => {
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

export const wobblyPolygon = (jitter: Jitter, points: Point[]): string =>
  points.map((point, i) => wobblyLine(jitter, point, points[(i + 1) % points.length] ?? point, 2)).join(' ');

export const stroke = (d: string, colour: string, width: number, data: string, opacity = 0.92): string =>
  `<path ${data} d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;

export const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const towards = (from: Point, to: Point, distance: number): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
};

// Doodles are spirals: a zigzag would read as a spring.
export const scribblePath = (jitter: Jitter, mark: { x: number; y: number; width: number; height: number }): string => {
  const points = Array.from({ length: SPIRAL_STEPS + 1 }, (_, i) => {
    const t = i / SPIRAL_STEPS;
    const angle = t * SPIRAL_TURNS * Math.PI * 2;
    return { x: mark.x + Math.cos(angle) * t * (mark.width / 2 - 6) + jitter(3), y: mark.y + Math.sin(angle) * t * (mark.height / 2 - 6) + jitter(3) };
  });
  return pathOf(points);
};

export const boardBackground = (width: number, height: number): string => `<defs>
    <radialGradient id="board" cx="45%" cy="40%" r="80%">
      <stop offset="0" stop-color="#fbfbf8"/>
      <stop offset="0.7" stop-color="#eeeeea"/>
      <stop offset="1" stop-color="#d9d9d3"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#board)"/>`;
