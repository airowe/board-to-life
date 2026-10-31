import { describe, expect, it } from 'vitest';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import { validateFigure, type Figure } from '../src/geometry/schema';
import { FIGURE_READER_PROMPT, MODEL_FIGURE_SCHEMA, obeyWrittenValues, readFigureWithModel, toFigure, type ModelFigure } from './figureReader';
import { TRIANGLE_READ_CASE_13_RUN_1, TRIANGLE_READ_CASE_14_RUN_2 } from './figureReader.fixtures';
import { drawingSize, PROVIDERS } from './sceneReader';

const PHOTO = { width: 2000, height: 1000 };
const PHOTO_SIZE = drawingSize(PHOTO);
const GRID = 1000;
const TIMEOUT_MS = 1000;
const CONFIDENCE = 0.9;
const RADIUS = 100;

const point = (id: string, x: number, y: number) => ({ id, x, y, confidence: CONFIDENCE });

const model: ModelFigure = {
  points: [point('A', 200, 700), point('B', 600, 700), point('C', 400, 300), point('O', 800, 200)],
  segments: [
    { id: 'sAB', from: 'A', to: 'B', confidence: CONFIDENCE },
    { id: 'sBC', from: 'B', to: 'C', confidence: CONFIDENCE },
    { id: 'sCA', from: 'C', to: 'A', confidence: CONFIDENCE },
  ],
  lines: [],
  rays: [],
  circles: [{ id: 'c1', centre: 'O', radius: RADIUS, confidence: CONFIDENCE }],
  polygons: [{ id: 'abc', vertices: ['A', 'B', 'C'], confidence: CONFIDENCE }],
  marks: [{ id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 50, confidence: CONFIDENCE }],
  transformations: [{ id: 'turn', kind: 'rotate', centre: 'O', degrees: -90, polygon: 'abc', confidence: CONFIDENCE }],
  labels: [{ id: 'l1', text: 'A', x: 180, y: 740, confidence: CONFIDENCE }],
  unknownMarks: [{ id: 'u1', x: 100, y: 100, width: 40, height: 40, note: 'a smiley', confidence: CONFIDENCE }],
  focus: { kind: 'transform', transformation: 'turn' },
};

type Converted = Figure;
const figure = (input: ModelFigure): Converted => toFigure(input, PHOTO) as Converted;

describe('FIGURE_READER_PROMPT', () => {
  it.each([
    'Name each point by the letter written beside it; if a point has no letter, call it P1, P2 and so on.',
    'Attach each written angle or length to the angle or side it was meant for, even when it is written a little away from it.',
    'Report a rotation in degrees counterclockwise as seen on the board; a clockwise rotation is negative.',
    'Report where two drawn lines cross as a point when an angle is marked there.',
    'A value with a degree sign is always an angle, never a length.',
    'A rotation or dilation centre is often drawn as a small cross with its letter beside it; report the centre where the cross is, not where the letter is.',
  ])('tells the model: %s', (sentence) => {
    expect(FIGURE_READER_PROMPT).toContain(sentence);
  });
});

describe('MODEL_FIGURE_SCHEMA', () => {
  it('requires every collection and a focus, and nothing else', () => {
    expect(MODEL_FIGURE_SCHEMA.required).toEqual([
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
      'focus',
    ]);
    expect(MODEL_FIGURE_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('toFigure', () => {
  it('scales the grid to the drawing size and sets the version', () => {
    const converted = figure(model);
    expect(converted).toMatchObject({ version: 1, drawing: PHOTO_SIZE });
    expect(converted.points[0]).toMatchObject({ x: (200 * PHOTO_SIZE.width) / GRID, y: (700 * PHOTO_SIZE.height) / GRID });
  });

  it('scales labels and unknown marks', () => {
    const converted = figure(model);
    expect(converted.labels[0]).toMatchObject({ x: (180 * PHOTO_SIZE.width) / GRID, y: (740 * PHOTO_SIZE.height) / GRID });
    expect(converted.unknownMarks[0]).toMatchObject({ width: (40 * PHOTO_SIZE.width) / GRID, height: (40 * PHOTO_SIZE.height) / GRID });
  });

  it('scales a circle radius, and leaves written degrees untouched', () => {
    const converted = figure(model);
    expect(converted.circles[0]?.radius).toBeCloseTo((RADIUS * Math.sqrt(PHOTO_SIZE.width * PHOTO_SIZE.height)) / GRID);
    expect(converted.marks[0]).toMatchObject({ degrees: 50 });
    expect(converted.transformations[0]).toMatchObject({ degrees: -90 });
  });

  it('keeps a focus that cites things in the figure', () => {
    expect(figure(model).focus).toEqual({ kind: 'transform', transformation: 'turn' });
  });

  it.each([
    ['a missing transformation', { kind: 'transform', transformation: 'flip' }],
    ['a missing polygon', { kind: 'angle-sum', polygon: 'pqr', drag: 'C' }],
    ['a missing drag point', { kind: 'angle-sum', polygon: 'abc', drag: 'Z' }],
    ['a missing mark', { kind: 'equal-angles', marks: ['mA', 'm9'], drag: 'C' }],
  ] as const)('drops a focus that cites %s', (_case, focus) => {
    expect(figure({ ...model, focus: structuredClone(focus) as ModelFigure['focus'] }).focus).toBeNull();
  });

  it('produces a figure that validates', () => {
    expect(validateFigure(toFigure(model, PHOTO))).toMatchObject({ ok: true });
  });
});

type ModelMark = ModelFigure['marks'][number];

const DEGREES_READ_AS_LENGTH = 50;
const SIDE_LENGTH = 7;

const degreesOnSide = (from: string, to: string, unit: string, value = DEGREES_READ_AS_LENGTH): ModelMark => ({
  id: 'lSide',
  kind: 'length',
  from,
  to,
  value,
  unit,
  confidence: CONFIDENCE,
});

const angleMarksAt = (converted: Figure, vertex: string) =>
  converted.marks.filter((mark) => mark.kind === 'angle' && mark.at === vertex && mark.degrees !== undefined);

const withMarks = (marks: ModelMark[]): ModelFigure => ({ ...model, marks, focus: null });

const WRITTEN_AT_A: ModelMark = { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 60, confidence: CONFIDENCE };
const WRITTEN_AT_B: ModelMark = { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 60, confidence: CONFIDENCE };

describe('toFigure with a degree value read as a length', () => {
  it.each([
    ['case-13-run-1', TRIANGLE_READ_CASE_13_RUN_1],
    ['case-14-run-2', TRIANGLE_READ_CASE_14_RUN_2],
  ])('turns the 50° on side AB in the %s read into the angle at A', (_name, read) => {
    const converted = figure(read);
    const atA = angleMarksAt(converted, 'A');
    expect(atA).toHaveLength(1);
    expect(atA[0]).toMatchObject({ kind: 'angle', at: 'A', degrees: DEGREES_READ_AS_LENGTH });
    expect(atA[0]?.kind === 'angle' && [atA[0].from, atA[0].to].sort()).toEqual(['B', 'C']);
    expect(converted.marks.filter((mark) => mark.kind === 'length')).toEqual([]);
    expect(converted.unknownMarks).toEqual([]);
    expect(validateFigure(converted)).toMatchObject({ ok: true });
  });

  it.each(['°', 'deg', 'Degrees', 'DEGREE', ' ° '])('reads the unit %j as degrees', (unit) => {
    const converted = figure(withMarks([WRITTEN_AT_B, degreesOnSide('A', 'B', unit)]));
    expect(converted.marks).toEqual([
      WRITTEN_AT_B,
      { id: 'lSide', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: DEGREES_READ_AS_LENGTH, confidence: CONFIDENCE },
    ]);
  });

  it.each<[string, ModelMark[]]>([
    ['both ends of the side already have degrees', [WRITTEN_AT_A, WRITTEN_AT_B, degreesOnSide('A', 'B', '°')]],
    ['neither end of the side has degrees', [degreesOnSide('A', 'B', '°')]],
    ['no polygon has the side', [WRITTEN_AT_B, degreesOnSide('A', 'O', '°')]],
  ])('moves the value to unknown marks when %s', (_case, marks) => {
    const converted = figure(withMarks(marks));
    expect(converted.marks.filter((mark) => mark.id === 'lSide')).toEqual([]);
    expect(converted.unknownMarks.filter((mark) => mark.id === 'lSide')).toEqual([
      expect.objectContaining({ note: expect.stringContaining(`${DEGREES_READ_AS_LENGTH}°`), confidence: CONFIDENCE }),
    ]);
    expect(validateFigure(converted)).toMatchObject({ ok: true });
  });

  it('places the unknown mark box centred on the side it was written on', () => {
    const [a, b] = [model.points[0], model.points[1]];
    if (!a || !b) throw new Error('model has no side AB');
    const converted = figure(withMarks([degreesOnSide('A', 'B', '°')]));
    const [box] = converted.unknownMarks.filter((mark) => mark.id === 'lSide');
    expect(box?.x).toBeCloseTo((((a.x + b.x) / 2) * PHOTO_SIZE.width) / GRID);
    expect(box?.y).toBeCloseTo((((a.y + b.y) / 2) * PHOTO_SIZE.height) / GRID);
  });

  const UNVALUED_AT_A: ModelMark = { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', confidence: CONFIDENCE };
  const EQUAL_ANGLES_ON_SIDE: ModelFigure['focus'] = { kind: 'equal-angles', marks: ['lSide', 'mB'], drag: 'C' };

  it.each<[string, ModelMark[]]>([
    ['merged into an unvalued angle mark', [WRITTEN_AT_B, UNVALUED_AT_A, degreesOnSide('A', 'B', '°')]],
    ['moved to unknown marks', [WRITTEN_AT_A, WRITTEN_AT_B, degreesOnSide('A', 'B', '°')]],
  ])('drops a focus naming a degree value that was %s, and still validates', (_case, marks) => {
    const converted = figure({ ...withMarks(marks), focus: EQUAL_ANGLES_ON_SIDE });
    expect(converted.marks.map((mark) => mark.id)).not.toContain('lSide');
    expect(converted.focus).toBeNull();
    expect(validateFigure(converted)).toMatchObject({ ok: true });
  });

  it('keeps a focus naming a degree value that became an angle mark', () => {
    const converted = figure({ ...withMarks([WRITTEN_AT_B, degreesOnSide('A', 'B', '°')]), focus: EQUAL_ANGLES_ON_SIDE });
    expect(converted.focus).toEqual(EQUAL_ANGLES_ON_SIDE);
  });

  it('leaves a real length untouched', () => {
    const length = degreesOnSide('A', 'B', 'cm', SIDE_LENGTH);
    expect(figure(withMarks([WRITTEN_AT_B, length])).marks).toEqual([WRITTEN_AT_B, length]);
  });
});

describe('obeyWrittenValues', () => {
  const triangle = GEOMETRY_SAMPLES[0]?.figure as Figure;
  const CONFLICTING_DEGREES = 100;

  it('moves the points so a written angle holds', () => {
    const skewed: Figure = { ...triangle, marks: triangle.marks.map((mark) => (mark.id === 'mA' ? { ...mark, degrees: 70 } : mark)) };
    expect(obeyWrittenValues(skewed).points).not.toEqual(skewed.points);
  });

  it('keeps the drawn points when the written values cannot all hold', () => {
    const conflicting: Figure = {
      ...triangle,
      marks: triangle.marks.map((mark) => (mark.kind === 'angle' && mark.id !== 'mC' ? { ...mark, degrees: CONFLICTING_DEGREES } : mark)),
    };
    expect(obeyWrittenValues(conflicting)).toBe(conflicting);
  });
});

describe('readFigureWithModel', () => {
  it('sends the prompt and the photo, and returns a converted figure', async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = (_input, init) => {
      requests.push(String(init?.body));
      const content = JSON.stringify(model);
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    };
    const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png', size: PHOTO };
    const result = await readFigureWithModel(photo, { ...PROVIDERS.meta, apiKey: 'test-key' }, { timeoutMs: TIMEOUT_MS, fetchImpl });
    const sent = JSON.parse(requests[0] ?? '{}') as { messages: { content: { type: string; text?: string }[] }[]; response_format: { json_schema: { name: string } } };
    expect(sent.messages[0]?.content.map((part) => part.type)).toEqual(['text', 'image_url']);
    expect(sent.messages[0]?.content[0]?.text).toBe(FIGURE_READER_PROMPT);
    expect(sent.response_format.json_schema.name).toBe('figure');
    expect(result).toMatchObject({ version: 1, drawing: PHOTO_SIZE });
  });
});
