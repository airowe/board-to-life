import type { BodySnapshot } from '../physics/simulation';

type Point = { x: number; y: number };
export type Trail = { id: string; points: Point[] };
export type TrailRecorder = { record: (snapshot: BodySnapshot[]) => void; trails: (minTravel: number) => Trail[] };

// The path each body's centre takes during a run, thinned to points at least `minGap` apart,
// so the last run can be left faintly on the board beside the next one.
export const createTrailRecorder = (minGap: number): TrailRecorder => {
  const paths = new Map<string, Point[]>();
  const latest = new Map<string, Point>();
  return {
    record: (snapshot) => {
      for (const { id, x, y } of snapshot) {
        latest.set(id, { x, y });
        const points = paths.get(id);
        const last = points?.at(-1);
        if (!points) paths.set(id, [{ x, y }]);
        else if (!last || Math.hypot(x - last.x, y - last.y) >= minGap) points.push({ x, y });
      }
    },
    trails: (minTravel) =>
      [...paths].flatMap(([id, points]) => {
        const end = latest.get(id);
        const last = points.at(-1);
        const full = end && last && (end.x !== last.x || end.y !== last.y) ? [...points, end] : points;
        const [first] = full;
        const travel = first ? Math.max(...full.map((point) => Math.hypot(point.x - first.x, point.y - first.y))) : 0;
        return travel >= minTravel ? [{ id, points: full }] : [];
      }),
  };
};
