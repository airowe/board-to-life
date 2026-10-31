import { toDrawing, type Point, type View } from '../present/view';
import type { Species, Web } from './schema';

export type WebEdits = { removed: ReadonlySet<string>; start: Record<string, number> };

const START_MAX_FACTOR = 4;

export const emptyEdits = (): WebEdits => ({ removed: new Set(), start: {} });

export const toggleRemoved = (edits: WebEdits, id: string): WebEdits => {
  const removed = new Set(edits.removed);
  if (!removed.delete(id)) removed.add(id);
  return { ...edits, removed };
};

export const startMax = (steady: Record<string, number>, id: string): number => START_MAX_FACTOR * (steady[id] ?? 0);

export const setStart = (edits: WebEdits, id: string, value: number, max: number): WebEdits => ({
  ...edits,
  start: { ...edits.start, [id]: Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), max) },
});

const distanceToBox = (box: Species, point: Point): number =>
  Math.hypot(Math.max(Math.abs(point.x - box.x) - box.width / 2, 0), Math.max(Math.abs(point.y - box.y) - box.height / 2, 0));

export const pickSpecies = (web: Web, view: View, screenPoint: Point, reachPx: number): string | null => {
  const point = toDrawing(view, screenPoint);
  const reach = reachPx / view.scale;
  const hits = web.species
    .map((entry) => ({ id: entry.id, distance: distanceToBox(entry, point), centre: Math.hypot(point.x - entry.x, point.y - entry.y) }))
    .filter((hit) => hit.distance <= reach)
    .sort((a, b) => a.distance - b.distance || a.centre - b.centre);
  return hits[0]?.id ?? null;
};

// What letting go of a species does: a tap toggles its removal; a drag sets its start, unless it is removed.
export type Press = { id: string; moved: boolean; value: number; max: number };

export const editOnRelease = (edits: WebEdits, press: Press): WebEdits | null => {
  if (!press.moved) return toggleRemoved(edits, press.id);
  if (edits.removed.has(press.id)) return null;
  return setStart(edits, press.id, press.value, press.max);
};
