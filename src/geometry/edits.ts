import { toDrawing, type View } from '../present/view';
import type { Point, Positions } from './derive';
import { fittedOrDrawn } from './fit';
import type { Figure, Polygon } from './schema';

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export const clampToDrawing = (figure: Figure, point: Point): Point => ({
  x: clamp(point.x, 0, figure.drawing.width),
  y: clamp(point.y, 0, figure.drawing.height),
});

const TEACHER_CONFIRMED = 1;

export const movePoint = (figure: Figure, id: string, to: Point): Figure => {
  if (!figure.points.some((entry) => entry.id === id)) return figure;
  const at = clampToDrawing(figure, to);
  return fittedOrDrawn({
    ...figure,
    points: figure.points.map((entry) => (entry.id === id ? { ...entry, ...at, confidence: TEACHER_CONFIRMED } : entry)),
  });
};

export const pickPoint = (figure: Figure, positions: Positions, view: View, screen: Point, reachPx: number): string | null => {
  const target = toDrawing(view, screen);
  const reach = reachPx / view.scale;
  const hits = figure.points
    .flatMap((entry) => {
      const at = positions[entry.id];
      return at === undefined ? [] : [{ id: entry.id, away: Math.hypot(at.x - target.x, at.y - target.y) }];
    })
    .filter((hit) => hit.away <= reach)
    .sort((a, b) => a.away - b.away);
  return hits[0]?.id ?? null;
};

export const insidePolygon = (positions: Positions, polygon: Polygon, point: Point): boolean => {
  const corners = polygon.vertices.map((id) => positions[id]);
  if (!corners.every((entry): entry is Point => entry !== undefined)) return false;
  return corners.reduce((inside, current, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length] ?? current;
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    return crosses ? !inside : inside;
  }, false);
};
