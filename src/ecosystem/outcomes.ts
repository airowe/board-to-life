import type { Series } from './model';

export type Direction = 'rose' | 'fell' | 'steady' | 'died out';

export const CHANGE_THRESHOLD = 0.1;
export const EXTINCT_FRACTION = 0.01;
const FINAL_WINDOW_STEPS = 100;

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const referenceLevel = (values: number[], eventStep: number): number => {
  const atEvent = values[eventStep] ?? 0;
  return atEvent > 0 ? atEvent : (values[eventStep - 1] ?? 0);
};

const directionOf = (values: number[], eventStep: number): Direction => {
  const reference = referenceLevel(values, eventStep);
  const final = mean(values.slice(-FINAL_WINDOW_STEPS));
  if (reference <= 0) return final > 0 ? 'rose' : 'steady';
  if (final < reference * EXTINCT_FRACTION) return 'died out';
  if (Math.abs(final - reference) <= reference * CHANGE_THRESHOLD) return 'steady';
  return final > reference ? 'rose' : 'fell';
};

export const directionsAfter = (series: Series, eventStep: number): Record<string, Direction> =>
  Object.fromEntries(series.ids.map((id) => [id, directionOf(series.values[id] ?? [], eventStep)]));
