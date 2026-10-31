import type { Box } from '../present/onPhoto';
import type { Point } from '../present/view';
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

export const chartPaths = (series: Series, box: Box, upTo: number): Record<string, string> => {
  const max = seriesMax(series);
  const lastIndex = Math.max(0, ...series.ids.map((id) => (series.values[id]?.length ?? 1) - 1));
  return Object.fromEntries(series.ids.map((id) => [id, pathOf(series.values[id] ?? [], box, max, lastIndex, upTo)]));
};

export const ringRadius = (value: number, start: number): number => {
  if (value <= 0) return RING_MIN;
  if (start <= 0) return RING_MAX;
  const fraction = Math.min(1, Math.sqrt(value / (start * RING_FULL_AT_STARTS)));
  return RING_MIN + (RING_MAX - RING_MIN) * fraction;
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
