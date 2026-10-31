import { fittedOrDrawn } from '../src/geometry/fit';
import type { Figure, Focus } from '../src/geometry/schema';
import type { ImageSize } from './imageSize';
import { drawingSize, requestModelJson, type CallOptions, type ModelPhoto, type ProviderWithKey } from './sceneReader';

// The model reports positions on the same 0-1000 grid as physics scenes and food webs.
const GRID = 1000;

type Confident = { id: string; confidence: number };
type ModelPoint = Confident & { x: number; y: number };
type ModelSegment = Confident & { from: string; to: string };
type ModelCircle = Confident & { centre: string; radius?: number; through?: string };
type ModelPolygon = Confident & { vertices: string[] };
type ModelLabel = Confident & { text: string; x: number; y: number };
type ModelUnknownMark = Confident & { x: number; y: number; width: number; height: number; note: string };

export type ModelFigure = {
  points: ModelPoint[];
  segments: ModelSegment[];
  lines: ModelSegment[];
  rays: ModelSegment[];
  circles: ModelCircle[];
  polygons: ModelPolygon[];
  marks: Figure['marks'];
  transformations: Figure['transformations'];
  labels: ModelLabel[];
  unknownMarks: ModelUnknownMark[];
  focus: Focus | null;
};

const number = { type: 'number' };
const positive = { type: 'number', exclusiveMinimum: 0 };
const id = { type: 'string', maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' };
const pair = { type: 'array', items: id, minItems: 2, maxItems: 2 };
const prose = { type: 'string', minLength: 1, maxLength: 120 };
const confidence = { type: 'number', minimum: 0, maximum: 1 };
const kind = (value: string) => ({ type: 'string', enum: [value] });
const objectOf = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const listOf = (item: unknown) => ({ type: 'array', items: item });
const joining = objectOf({ id, from: id, to: id, confidence });

export const MODEL_FIGURE_SCHEMA = objectOf({
  points: listOf(objectOf({ id, x: number, y: number, confidence })),
  segments: listOf(joining),
  lines: listOf(joining),
  rays: listOf(joining),
  circles: listOf(objectOf({ id, centre: id, radius: positive, through: id, confidence }, ['id', 'centre', 'confidence'])),
  polygons: listOf(objectOf({ id, vertices: { type: 'array', items: id, minItems: 3 }, confidence })),
  marks: listOf({
    anyOf: [
      objectOf({ id, kind: kind('angle'), at: id, from: id, to: id, degrees: number, confidence }, ['id', 'kind', 'at', 'from', 'to', 'confidence']),
      objectOf({ id, kind: kind('right'), at: id, from: id, to: id, confidence }),
      objectOf({ id, kind: kind('length'), from: id, to: id, value: number, unit: prose, confidence }, ['id', 'kind', 'from', 'to', 'confidence']),
      objectOf({ id, kind: kind('equal'), segments: listOf(pair), ticks: { type: 'integer', minimum: 1 }, confidence }),
      objectOf({ id, kind: kind('parallel'), lines: listOf(pair), confidence }),
    ],
  }),
  transformations: listOf({
    anyOf: [
      objectOf({ id, kind: kind('reflect'), mirror: pair, polygon: id, confidence }),
      objectOf({ id, kind: kind('rotate'), centre: id, degrees: number, polygon: id, confidence }),
      objectOf({ id, kind: kind('translate'), from: id, to: id, polygon: id, confidence }),
      objectOf({ id, kind: kind('dilate'), centre: id, factor: positive, polygon: id, confidence }),
    ],
  }),
  labels: listOf(objectOf({ id, text: prose, x: number, y: number, confidence })),
  unknownMarks: listOf(objectOf({ id, x: number, y: number, width: positive, height: positive, note: prose, confidence })),
  focus: {
    anyOf: [
      { type: 'null' },
      objectOf({ kind: kind('transform'), transformation: id }),
      objectOf({ kind: kind('angle-sum'), polygon: id, drag: id }),
      objectOf({ kind: kind('equal-angles'), marks: pair, drag: id }),
    ],
  },
});

export const FIGURE_FORMAT = `Read it into the JSON format you are given.
Name each point by the letter written beside it; if a point has no letter, call it P1, P2 and so on.
Report where two drawn lines cross as a point when an angle is marked there.
Each point is its x, y position. Segments join two points; lines run on past both points; rays start at the first point and run on past the second.
A circle has a centre point and either a radius or a point it passes through.
A polygon lists its vertices in order around the shape, such as A, B, C for triangle ABC.
Attach each written angle or length to the angle or side it was meant for, even when it is written a little away from it.
An angle mark is at its vertex point, between the rays to its from and to points; give its degrees when a value is written. A small square in a corner is a right mark.
A length mark gives the written value and unit of the side from one point to another. Tick marks that show equal sides are an equal mark; arrowheads that show parallel lines are a parallel mark.
Report a rotation in degrees counterclockwise as seen on the board; a clockwise rotation is negative.
A transformation moves one polygon: a reflection over the mirror line through two points, a rotation about a centre point, a translation along the arrow from one point to another, or a dilation about a centre point by a scale factor.
The focus is what the class should predict: {"kind":"transform","transformation":id} to play a transformation, {"kind":"angle-sum","polygon":id,"drag":point} to drag a vertex and watch the angle sum, {"kind":"equal-angles","marks":[mark,mark],"drag":point} to drag a line and watch two marked angles, or null when the board does not say.
Use short ids such as A, B, sAB, abc, m1, and give everything a confidence from 0 to 1 for how sure you are it is really there as described.
Handwritten words and numbers that are not attached to a mark go in labels. Any other mark goes in unknownMarks, with a box around it and a short note of what it looks like.`;

export const FIGURE_READER_PROMPT = `This is a photo of a whiteboard drawing of a geometry figure that a class will explore.
Give every position and size on a 0-1000 grid over this image: (0,0) is the top-left corner, x grows to the right and y grows downwards.

${FIGURE_FORMAT}
Read every value exactly as it is written, even if the drawing does not match it.
Ignore faint, faded or smudged grey marks: they are left over from an erased drawing.
Do not invent points, lines or marks that are not drawn.
A value with a degree sign is always an angle, never a length.
A rotation or dilation centre is often drawn as a small cross with its letter beside it; report the centre where the cross is, not where the letter is.`;

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

const DEGREE_UNIT = /^(°|deg|degrees?)$/i;
const SMALLEST_BOX = 20;

type ModelMark = ModelFigure['marks'][number];
type DegreeLength = Extract<ModelMark, { kind: 'length' }> & { value: number };
type AngleMark = Extract<ModelMark, { kind: 'angle' }>;
type MarkReading = Pick<ModelFigure, 'marks' | 'unknownMarks'>;

const isDegreeLength = (mark: ModelMark): mark is DegreeLength =>
  mark.kind === 'length' && mark.value !== undefined && mark.unit !== undefined && DEGREE_UNIT.test(mark.unit.trim());

const hasDegrees = (marks: ModelMark[], vertex: string): boolean =>
  marks.some((mark) => (mark.kind === 'right' || (mark.kind === 'angle' && mark.degrees !== undefined)) && mark.at === vertex);

const neighboursOf = ({ vertices }: ModelPolygon, vertex: string): [string, string] | null => {
  const index = vertices.indexOf(vertex);
  const [previous, next] = [vertices.at(index - 1), vertices[(index + 1) % vertices.length]];
  return index < 0 || previous === undefined || next === undefined ? null : [previous, next];
};

const hasSide = (polygon: ModelPolygon, from: string, to: string): boolean => neighboursOf(polygon, from)?.includes(to) ?? false;

const angleFromDegrees = (marks: ModelMark[], polygons: ModelPolygon[], mark: DegreeLength): AngleMark | null => {
  const polygon = polygons.find((entry) => hasSide(entry, mark.from, mark.to));
  const open = [mark.from, mark.to].filter((vertex) => !hasDegrees(marks, vertex));
  const [at] = open;
  if (polygon === undefined || open.length !== 1 || at === undefined) return null;
  const along = at === mark.from ? mark.to : mark.from;
  const neighbours = neighboursOf(polygon, at);
  const other = neighbours?.find((vertex) => vertex !== along);
  if (other === undefined) return null;
  return { id: mark.id, kind: 'angle', at, from: along, to: other, degrees: mark.value, confidence: mark.confidence };
};

const sameAngle = (mark: ModelMark, angle: AngleMark): mark is AngleMark =>
  mark.kind === 'angle' &&
  mark.at === angle.at &&
  [mark.from, mark.to].sort().join() === [angle.from, angle.to].sort().join();

const ORIGIN = { x: 0, y: 0 };

const unknownFor = (points: ModelPoint[], mark: DegreeLength): ModelUnknownMark => {
  const found = points.filter((entry) => entry.id === mark.from || entry.id === mark.to);
  const ends = found.length === 0 ? [ORIGIN] : found;
  const xs = ends.map((entry) => entry.x);
  const ys = ends.map((entry) => entry.y);
  return {
    id: mark.id,
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    width: Math.max(SMALLEST_BOX, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(SMALLEST_BOX, Math.max(...ys) - Math.min(...ys)),
    note: `${mark.value}° written on side ${mark.from}${mark.to}`,
    confidence: mark.confidence,
  };
};

const placeDegrees = (model: ModelFigure) => (reading: MarkReading, mark: DegreeLength): MarkReading => {
  const others = reading.marks.filter((entry) => entry !== mark);
  const angle = angleFromDegrees(others, model.polygons, mark);
  if (angle === null) return { marks: others, unknownMarks: [...reading.unknownMarks, unknownFor(model.points, mark)] };
  const unvalued = others.find((entry) => sameAngle(entry, angle) && entry.degrees === undefined);
  const marks =
    unvalued === undefined
      ? reading.marks.map((entry) => (entry === mark ? angle : entry))
      : others.map((entry) => (entry === unvalued ? { ...unvalued, degrees: angle.degrees } : entry));
  return { ...reading, marks };
};

const degreesAsAngles = (model: ModelFigure): MarkReading =>
  model.marks.filter(isDegreeLength).reduce(placeDegrees(model), { marks: model.marks, unknownMarks: model.unknownMarks });

const focusIsGrounded = (model: ModelFigure, marks: ModelMark[], focus: Focus): boolean => {
  const has = (entries: { id: string }[], wanted: string): boolean => entries.some((entry) => entry.id === wanted);
  switch (focus.kind) {
    case 'transform':
      return has(model.transformations, focus.transformation);
    case 'angle-sum':
      return has(model.polygons, focus.polygon) && has(model.points, focus.drag);
    case 'equal-angles':
      return focus.marks.every((mark) => has(marks, mark)) && has(model.points, focus.drag);
  }
};

export const toFigure = (model: ModelFigure, photo: ImageSize): unknown => {
  const size = drawingSize(photo);
  const sx = size.width / GRID;
  const sy = size.height / GRID;
  const px = (x: number) => clamp(x * sx, size.width);
  const py = (y: number) => clamp(y * sy, size.height);
  const radiusScale = Math.sqrt(sx * sy);
  const { marks, unknownMarks } = degreesAsAngles(model);

  return {
    version: 1,
    drawing: { width: size.width, height: size.height },
    points: model.points.map((entry) => ({ ...entry, x: px(entry.x), y: py(entry.y) })),
    segments: model.segments,
    lines: model.lines,
    rays: model.rays,
    circles: model.circles.map((entry) => (entry.radius === undefined ? entry : { ...entry, radius: entry.radius * radiusScale })),
    polygons: model.polygons,
    marks,
    transformations: model.transformations,
    labels: model.labels.map((label) => ({ ...label, x: px(label.x), y: py(label.y) })),
    unknownMarks: unknownMarks.map((mark) => ({ ...mark, x: px(mark.x), y: py(mark.y), width: mark.width * sx, height: mark.height * sy })),
    focus: model.focus !== null && focusIsGrounded(model, marks, model.focus) ? model.focus : null,
  };
};

export const obeyWrittenValues = (figure: Figure): Figure => fittedOrDrawn(figure);

export const readFigureWithModel = async (photo: ModelPhoto, provider: ProviderWithKey, options: CallOptions): Promise<unknown> => {
  const image = `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
  const parsed = await requestModelJson(
    [
      { type: 'text', text: FIGURE_READER_PROMPT },
      { type: 'image_url', image_url: { url: image } },
    ],
    { name: 'figure', schema: MODEL_FIGURE_SCHEMA },
    provider,
    options,
  );
  return toFigure(parsed as ModelFigure, photo.size);
};
