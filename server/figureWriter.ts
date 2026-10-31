import { imageOf, positionsOf, type Point, type Positions } from '../src/geometry/derive';
import { citedPointIds, validateFigure, type Figure, type Polygon } from '../src/geometry/schema';
import { FIGURE_FORMAT, MODEL_FIGURE_SCHEMA, obeyWrittenValues, toFigure, type ModelFigure } from './figureReader';
import { requestModelJson, type CallOptions, type ProviderWithKey } from './sceneReader';
import { LayoutError, WRITER_SIZE } from './sceneWriter';

const LAYOUT_ATTEMPTS = 2;
export const IMAGE_LANDING_FRACTION = 0.05;

export const figureWriterPrompt = (description: string, errors: readonly string[]): string =>
  [
    'A teacher has described a geometry figure that a class will explore. Draw it as a teacher would on a whiteboard 3 units wide by 2 tall, on a 0-1000 grid.',
    'Give every position and size on a 0-1000 grid: (0,0) is the top-left corner, x grows to the right and y grows downwards.',
    `Description: ${description}`,
    FIGURE_FORMAT,
    'Use the letters the description uses for its points. Write each value the description gives as a mark on the angle or side it belongs to.',
    'Draw the shapes close to the values given, large enough to read, and keep every point on the board with a margin around the edge.',
    'When the description says two lines are parallel, mark them with a parallel mark and draw them parallel.',
    'When the description asks to reflect, rotate, translate or dilate a shape, add that transformation and make it the focus. Otherwise the focus is null.',
    'Do not draw where a transformed shape lands; the app animates it.',
    'Draw only what the description mentions. Give no unknownMarks and a confidence of 1 on everything.',
    ...(errors.length > 0 ? ['Your last layout was rejected for these reasons; fix them:', ...errors] : []),
  ].join('\n');

const landingSpots = (figure: Figure, positions: Positions): Point[] =>
  figure.transformations.flatMap((transformation) => {
    const polygon = figure.polygons.find((entry) => entry.id === transformation.polygon);
    return polygon ? Object.values(imageOf(positions, transformation, polygon)) : [];
  });

const isDrawnImage = (polygon: Polygon, positions: Positions, spots: Point[], within: number): boolean =>
  polygon.vertices.every((id) => {
    const at = positions[id];
    return at !== undefined && spots.some((spot) => Math.hypot(spot.x - at.x, spot.y - at.y) <= within);
  });

const POINT_NAME_WORD = /\b[A-Z][A-Z0-9′']*(?![a-z])/g;
const POINT_NAME = /[A-Z][′']*\d*/g;

export const namedPoints = (description: string): Set<string> =>
  new Set((description.match(POINT_NAME_WORD) ?? []).flatMap((word) => word.match(POINT_NAME) ?? []));

const isUnnamed = (polygon: Polygon, named: Set<string>): boolean => polygon.vertices.some((id) => !named.has(id));

export const withoutDrawnImages = (figure: Figure, description: string): Figure => {
  if (figure.transformations.length === 0) return figure;
  const positions = positionsOf(figure);
  const spots = landingSpots(figure, positions);
  const transformed = new Set(figure.transformations.map((entry) => entry.polygon));
  const within = IMAGE_LANDING_FRACTION * figure.drawing.width;
  const named = namedPoints(description);
  const dropped = figure.polygons.filter(
    (entry) => !transformed.has(entry.id) && (isDrawnImage(entry, positions, spots, within) || isUnnamed(entry, named)),
  );
  if (dropped.length === 0) return figure;
  const kept = { ...figure, polygons: figure.polygons.filter((entry) => !dropped.includes(entry)) };
  const stillCited = citedPointIds(kept);
  const freed = new Set(dropped.flatMap((entry) => entry.vertices).filter((id) => !stillCited.has(id)));
  return { ...kept, points: kept.points.filter((entry) => !freed.has(entry.id)) };
};

export const describeFigureWithModel = async (description: string, provider: ProviderWithKey, options: CallOptions): Promise<Figure> => {
  const deadline = performance.now() + options.timeoutMs;
  let errors: string[] = [];
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS; attempt += 1) {
    const parsed = await requestModelJson(
      [{ type: 'text', text: figureWriterPrompt(description, errors) }],
      { name: 'figure', schema: MODEL_FIGURE_SCHEMA },
      provider,
      { ...options, timeoutMs: Math.max(1, deadline - performance.now()) },
    );
    const result = validateFigure(toFigure(parsed as ModelFigure, WRITER_SIZE));
    if (result.ok) return obeyWrittenValues(withoutDrawnImages(result.figure, description));
    errors = result.errors;
  }
  throw new LayoutError('invalid', 'The layout failed validation.', errors);
};
