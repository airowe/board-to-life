import { z } from 'zod';

const id = z.string().min(1);
const confidence = z.number().min(0).max(1);
const coord = z.number();
const size = z.number().positive();
const MIN_POLYGON_VERTICES = 3;
const STRAIGHT_ANGLE_DEGREES = 180;
const writtenDegrees = z.number().positive().max(STRAIGHT_ANGLE_DEGREES);
export const MAX_FIGURE_ITEMS = 200;

const listOf = <T extends z.ZodType>(name: string, item: T) =>
  z.array(item).max(MAX_FIGURE_ITEMS, `at most ${MAX_FIGURE_ITEMS} ${name} are allowed`);

const figurePoint = z.object({ id, x: coord, y: coord, confidence });

const segment = z.object({ id, from: id, to: id, confidence });

const circle = z.object({ id, centre: id, radius: size.optional(), through: id.optional(), confidence });

const polygon = z.object({ id, vertices: listOf('vertices', id).min(MIN_POLYGON_VERTICES), confidence });

const pointPair = z.tuple([id, id]);

const mark = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('angle'), at: id, from: id, to: id, degrees: writtenDegrees.optional(), confidence }),
  z.object({ id, kind: z.literal('right'), at: id, from: id, to: id, confidence }),
  z.object({ id, kind: z.literal('length'), from: id, to: id, value: size.optional(), unit: z.string().min(1).optional(), confidence }),
  z.object({ id, kind: z.literal('equal'), segments: z.array(pointPair), ticks: z.number().int().positive(), confidence }),
  z.object({ id, kind: z.literal('parallel'), lines: z.array(pointPair), confidence }),
]);

const transformation = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('reflect'), mirror: pointPair, polygon: id, confidence }),
  z.object({ id, kind: z.literal('rotate'), centre: id, degrees: z.number(), polygon: id, confidence }),
  z.object({ id, kind: z.literal('translate'), from: id, to: id, polygon: id, confidence }),
  z.object({ id, kind: z.literal('dilate'), centre: id, factor: size, polygon: id, confidence }),
]);

const focus = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('transform'), transformation: id }),
  z.object({ kind: z.literal('angle-sum'), polygon: id, drag: id }),
  z.object({ kind: z.literal('equal-angles'), marks: pointPair, drag: id }),
]);

const label = z.object({ id, text: z.string().min(1), x: coord, y: coord, confidence });

const unknownMark = z.object({ id, x: coord, y: coord, width: size, height: size, note: z.string().min(1), confidence });

const figureSchema = z.object({
  version: z.literal(1),
  drawing: z.object({ width: size, height: size }),
  points: listOf('points', figurePoint),
  segments: listOf('segments', segment),
  lines: listOf('lines', segment),
  rays: listOf('rays', segment),
  circles: listOf('circles', circle),
  polygons: listOf('polygons', polygon),
  marks: listOf('marks', mark),
  transformations: listOf('transformations', transformation),
  labels: listOf('labels', label),
  unknownMarks: listOf('unknownMarks', unknownMark),
  focus: focus.nullable(),
});

export type Figure = z.infer<typeof figureSchema>;
export type FigurePoint = Figure['points'][number];
export type Segment = Figure['segments'][number];
export type Line = Segment;
export type Ray = Segment;
export type Circle = Figure['circles'][number];
export type Polygon = Figure['polygons'][number];
export type Mark = Figure['marks'][number];
export type Transformation = Figure['transformations'][number];
export type Focus = z.infer<typeof focus>;

export type FigureValidationResult = { ok: true; figure: Figure } | { ok: false; errors: string[] };

export const NO_POINTS_ERROR = 'The figure needs at least one named point.';

const NAMED_COLLECTIONS = [
  'points',
  'segments',
  'lines',
  'rays',
  'circles',
  'polygons',
  'marks',
  'transformations',
  'labels',
  'unknownMarks',
] as const;

const duplicateIdErrors = (figure: Figure): string[] => {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const collection of NAMED_COLLECTIONS) {
    for (const entry of figure[collection]) {
      if (seen.has(entry.id)) errors.push(`duplicate id "${entry.id}"`);
      seen.add(entry.id);
    }
  }
  return errors;
};

const markPointIds = (entry: Mark): string[] => {
  switch (entry.kind) {
    case 'angle':
    case 'right':
      return [entry.at, entry.from, entry.to];
    case 'length':
      return [entry.from, entry.to];
    case 'equal':
      return entry.segments.flat();
    case 'parallel':
      return entry.lines.flat();
  }
};

const transformationPointIds = (entry: Transformation): string[] => {
  switch (entry.kind) {
    case 'reflect':
      return entry.mirror;
    case 'rotate':
    case 'dilate':
      return [entry.centre];
    case 'translate':
      return [entry.from, entry.to];
  }
};

type Citation = { kind: string; id: string; pointIds: string[] };

const citations = (figure: Figure): Citation[] => [
  ...figure.segments.map((entry) => ({ kind: 'segment', id: entry.id, pointIds: [entry.from, entry.to] })),
  ...figure.lines.map((entry) => ({ kind: 'line', id: entry.id, pointIds: [entry.from, entry.to] })),
  ...figure.rays.map((entry) => ({ kind: 'ray', id: entry.id, pointIds: [entry.from, entry.to] })),
  ...figure.circles.map((entry) => ({
    kind: 'circle',
    id: entry.id,
    pointIds: entry.through === undefined ? [entry.centre] : [entry.centre, entry.through],
  })),
  ...figure.polygons.map((entry) => ({ kind: 'polygon', id: entry.id, pointIds: entry.vertices })),
  ...figure.marks.map((entry) => ({ kind: 'mark', id: entry.id, pointIds: markPointIds(entry) })),
  ...figure.transformations.map((entry) => ({ kind: 'transformation', id: entry.id, pointIds: transformationPointIds(entry) })),
];

const focusPointIds = (chosen: Focus | null): string[] => (chosen === null || chosen.kind === 'transform' ? [] : [chosen.drag]);

export const citedPointIds = (figure: Figure): Set<string> =>
  new Set([...citations(figure).flatMap(({ pointIds }) => pointIds), ...focusPointIds(figure.focus)]);

const missingPointErrors = (figure: Figure): string[] => {
  const pointIds = new Set(figure.points.map((entry) => entry.id));
  return citations(figure).flatMap(({ kind, id: ownerId, pointIds: cited }) =>
    [...new Set(cited)]
      .filter((pointId) => !pointIds.has(pointId))
      .map((pointId) => `${kind} "${ownerId}" references missing point "${pointId}"`),
  );
};

const circleErrors = (figure: Figure): string[] =>
  figure.circles
    .filter((entry) => (entry.radius === undefined) === (entry.through === undefined))
    .map((entry) => `circle "${entry.id}" needs exactly one of radius or through`);

const repeatedVertexErrors = (figure: Figure): string[] =>
  figure.polygons.flatMap((entry) =>
    [...new Set(entry.vertices.filter((vertex, index) => entry.vertices.indexOf(vertex) !== index))].map(
      (vertex) => `polygon "${entry.id}" repeats vertex "${vertex}"`,
    ),
  );

const transformationPolygonErrors = (figure: Figure): string[] => {
  const polygonIds = new Set(figure.polygons.map((entry) => entry.id));
  return figure.transformations
    .filter((entry) => !polygonIds.has(entry.polygon))
    .map((entry) => `transformation "${entry.id}" references missing polygon "${entry.polygon}"`);
};

const focusErrors = (figure: Figure): string[] => {
  const { focus: chosen } = figure;
  if (chosen === null) return [];
  const pointIds = new Set(figure.points.map((entry) => entry.id));
  const polygonIds = new Set(figure.polygons.map((entry) => entry.id));
  const markIds = new Set(figure.marks.map((entry) => entry.id));
  const angleMarkIds = new Set(figure.marks.filter((entry) => entry.kind === 'angle').map((entry) => entry.id));
  const transformationIds = new Set(figure.transformations.map((entry) => entry.id));
  const missing = (what: string, known: Set<string>, cited: string): string[] =>
    known.has(cited) ? [] : [`focus references missing ${what} "${cited}"`];
  switch (chosen.kind) {
    case 'transform':
      return missing('transformation', transformationIds, chosen.transformation);
    case 'angle-sum':
      return [...missing('polygon', polygonIds, chosen.polygon), ...missing('point', pointIds, chosen.drag)];
    case 'equal-angles':
      return [
        ...chosen.marks.flatMap((cited) =>
          markIds.has(cited) ? (angleMarkIds.has(cited) ? [] : [`focus mark "${cited}" is not an angle mark`]) : missing('mark', markIds, cited),
        ),
        ...missing('point', pointIds, chosen.drag),
      ];
  }
};

const crossReferenceErrors = (figure: Figure): string[] => {
  if (figure.points.length === 0) return [NO_POINTS_ERROR];
  return [
    ...duplicateIdErrors(figure),
    ...missingPointErrors(figure),
    ...circleErrors(figure),
    ...repeatedVertexErrors(figure),
    ...transformationPolygonErrors(figure),
    ...focusErrors(figure),
  ];
};

const idAt = (input: unknown, collection: string, index: number): string | undefined => {
  const entries = (input as Record<string, unknown> | null)?.[collection];
  const entry = Array.isArray(entries) ? (entries[index] as { id?: unknown } | null | undefined) : undefined;
  return typeof entry?.id === 'string' && entry.id !== '' ? entry.id : undefined;
};

const describeIssue = (input: unknown, issue: z.core.$ZodIssue): string => {
  const [collection, index, ...rest] = issue.path;
  const entryId =
    typeof collection === 'string' && typeof index === 'number' && (NAMED_COLLECTIONS as readonly string[]).includes(collection)
      ? idAt(input, collection, index)
      : undefined;
  const where = entryId === undefined ? issue.path.join('.') || '(root)' : [collection, entryId, ...rest].join(' ');
  return `${where}: ${issue.message}`;
};

export const validateFigure = (input: unknown): FigureValidationResult => {
  const parsed = figureSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => describeIssue(input, issue)) };
  }
  const errors = crossReferenceErrors(parsed.data);
  return errors.length === 0 ? { ok: true, figure: parsed.data } : { ok: false, errors };
};
