import type { Box } from '../present/onPhoto';
import { viewOf, type Point, type View } from '../present/view';
import { feedsAlong, type Series } from './model';
import type { Web } from './schema';

export const RING_MIN = 6;
export const RING_MAX = 60;
const RING_FULL_AT_STARTS = 2;
const DOT_PERIOD_STEPS = 60;
const MIN_CHART_MAX = 1;
const DECIMALS = 100;

const round = (value: number): number => Math.round(value * DECIMALS) / DECIMALS;

const seriesMax = (series: Series): number =>
  Math.max(MIN_CHART_MAX, ...series.ids.flatMap((id) => series.values[id] ?? []));

const pathOf = (values: number[], box: Box, max: number, lastIndex: number, upTo: number): string => {
  const shown = values.slice(0, Math.max(0, Math.min(upTo, lastIndex)) + 1);
  return shown
    .map((value, index) => {
      const x = box.x + (lastIndex === 0 ? 0 : (index / lastIndex) * box.width);
      const y = box.y + box.height - (Math.min(value, max) / max) * box.height;
      return `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
    })
    .join(' ');
};

export const chartPaths = (series: Series, box: Box, upTo: number, max: number = seriesMax(series)): Record<string, string> => {
  const lastIndex = Math.max(0, ...series.ids.map((id) => (series.values[id]?.length ?? 1) - 1));
  return Object.fromEntries(series.ids.map((id) => [id, pathOf(series.values[id] ?? [], box, max, lastIndex, upTo)]));
};

// Each species against its own starting number, so every line begins together at 100 and a small population's change
// shows as plainly as a large one's. That is the question the class is asked: did it rise, fall or die out?
export const percentOfStart = (series: Series): Series => ({
  ids: series.ids,
  values: Object.fromEntries(
    series.ids.map((id) => {
      const values = series.values[id] ?? [];
      const start = values[0] ?? 0;
      return [id, values.map((value) => (start > 0 ? (value / start) * 100 : 0))];
    }),
  ),
});

const PERCENT_MIN_TOP = 150;
const PERCENT_STEPS: readonly (readonly [number, number])[] = [
  [200, 50],
  [500, 100],
  [1000, 200],
];
const PERCENT_LARGEST_STEP = 500;

export const percentScale = (highest: number): { max: number; ticks: number[] } => {
  const step = PERCENT_STEPS.find(([upTo]) => highest <= upTo)?.[1] ?? PERCENT_LARGEST_STEP;
  const max = Math.max(PERCENT_MIN_TOP, Math.ceil(highest / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, index) => index * step) };
};

// Moves labels the least needed so none overlap, inside [low, high]. Answers in the order given.
export const spreadLabels = (ys: readonly number[], gap: number, low: number, high: number): number[] => {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const placed = order.map((entry) => entry.y);
  placed.forEach((y, index) => {
    placed[index] = Math.max(y, low, index > 0 ? (placed[index - 1] as number) + gap : low);
  });
  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const ceiling = index === placed.length - 1 ? high : (placed[index + 1] as number) - gap;
    placed[index] = Math.min(placed[index] as number, ceiling);
  }
  const answer = [...ys];
  order.forEach((entry, index) => {
    answer[entry.index] = placed[index] as number;
  });
  return answer;
};

export const eventLabel = (web: Pick<Web, 'species' | 'event'>): string => {
  if (!web.event) return '';
  if (web.event.kind === 'drought') return 'Drought';
  const { species } = web.event;
  return `${web.species.find((entry) => entry.id === species)?.name ?? species} removed`;
};

export const ringRadius = (value: number, start: number): number => {
  if (value <= 0) return RING_MIN;
  if (start <= 0) return RING_MAX;
  const fraction = Math.min(1, Math.sqrt(value / (start * RING_FULL_AT_STARTS)));
  return RING_MIN + (RING_MAX - RING_MIN) * fraction;
};

// The drawing as large as fits with every ring at its largest still on screen, so a species near an edge is not cut off.
export const fitWebToScreen = (screen: { width: number; height: number }, web: Pick<Web, 'drawing' | 'species'>): View => {
  const { width, height } = web.drawing;
  const margin = Math.max(
    0,
    ...web.species.map((entry) => {
      const reach = Math.max(entry.width, entry.height) / 2 + RING_MAX;
      return Math.max(reach - entry.x, reach - entry.y, entry.x + reach - width, entry.y + reach - height);
    }),
  );
  const view = viewOf(screen, { width: width + 2 * margin, height: height + 2 * margin });
  return { ...view, offsetX: view.offsetX + margin * view.scale, offsetY: view.offsetY + margin * view.scale };
};

// An arrow between two discs, stopping at each edge so its head stays in view.
export const shortenedArrow = (from: Point, to: Point, fromRadius: number, toRadius: number): { from: Point; to: Point } | null => {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  const length = Math.hypot(dx, dy);
  if (length <= fromRadius + toRadius) return null;
  const [ux, uy] = [dx / length, dy / length];
  return { from: { x: from.x + ux * fromRadius, y: from.y + uy * fromRadius }, to: { x: to.x - ux * toRadius, y: to.y - uy * toRadius } };
};

export type FeedingDot = { fromId: string; toId: string; from: Point; to: Point; t: number };

export const feedingDots = (web: Web, step: number): FeedingDot[] => {
  const centres = new Map(web.species.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
  const drawn = web.eats.filter((arrow) => feedsAlong(web, arrow));
  return drawn.map((arrow, index) => ({
    fromId: arrow.from,
    toId: arrow.to,
    from: centres.get(arrow.from) as Point,
    to: centres.get(arrow.to) as Point,
    t: (step / DOT_PERIOD_STEPS + index / drawn.length) % 1,
  }));
};
