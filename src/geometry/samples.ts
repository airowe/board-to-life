import type { FigureFact } from './focus';
import type { Figure, FigurePoint, Mark, Polygon, Segment, Transformation } from './schema';

export type FigureSample = {
  id: string;
  title: string;
  figure: Figure;
  expect: FigureFact[];
};

const DRAWING = { width: 1200, height: 800 };
const CONFIDENCE = 0.95;
const STRAIGHT_ANGLE = 180;
const TRIANGLE_ID = 'abc';

const point = (id: string, x: number, y: number): FigurePoint => ({ id, x, y, confidence: CONFIDENCE });

const join = (id: string, from: string, to: string): Segment => ({ id, from, to, confidence: CONFIDENCE });

const angle = (id: string, at: string, from: string, to: string, degrees?: number): Mark => ({
  id,
  kind: 'angle',
  at,
  from,
  to,
  ...(degrees === undefined ? {} : { degrees }),
  confidence: CONFIDENCE,
});

const label = (id: string, text: string, x: number, y: number): Figure['labels'][number] => ({
  id,
  text,
  x,
  y,
  confidence: CONFIDENCE,
});

const triangleABC: Polygon = { id: TRIANGLE_ID, vertices: ['A', 'B', 'C'], confidence: CONFIDENCE };

const triangleSides = (): Segment[] => [join('sAB', 'A', 'B'), join('sBC', 'B', 'C'), join('sCA', 'C', 'A')];

const figure = (parts: Partial<Figure> & Pick<Figure, 'points'>): Figure => ({
  version: 1,
  drawing: DRAWING,
  segments: [],
  lines: [],
  rays: [],
  circles: [],
  polygons: [],
  marks: [],
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
  ...parts,
});

const angleSumMarks = (): Mark[] => [angle('mA', 'A', 'B', 'C', 50), angle('mB', 'B', 'C', 'A', 60), angle('mC', 'C', 'A', 'B')];

const angleSumExpect: FigureFact[] = [{ kind: 'angle-sum', polygon: TRIANGLE_ID, degrees: STRAIGHT_ANGLE }];

const triangle: FigureSample = {
  id: 'triangle',
  title: 'Angles in a triangle',
  figure: figure({
    points: [point('A', 300, 600), point('B', 800, 600), point('C', 585, 255)],
    segments: triangleSides(),
    polygons: [triangleABC],
    marks: angleSumMarks(),
  }),
  expect: angleSumExpect,
};

const parallel: FigureSample = {
  id: 'parallel',
  title: 'Parallel lines and a transversal',
  figure: figure({
    points: [
      point('P', 250, 300),
      point('Q', 900, 300),
      point('R', 200, 500),
      point('S', 850, 500),
      point('T', 583.4, 164.1),
      point('U', 401.3, 554.4),
      point('P1', 520, 300),
      point('P2', 426.7, 500),
    ],
    lines: [join('lPQ', 'P', 'Q'), join('lRS', 'R', 'S'), join('lTU', 'T', 'U')],
    marks: [
      { id: 'par', kind: 'parallel', lines: [['P', 'Q'], ['R', 'S']], confidence: CONFIDENCE },
      angle('m1', 'P1', 'T', 'Q', 65),
      angle('m2', 'P2', 'T', 'S'),
    ],
  }),
  expect: [{ kind: 'equal-angles', marks: ['m1', 'm2'], degrees: 65 }],
};

const reflect: Transformation = { id: 'flip', kind: 'reflect', mirror: ['M', 'N'], polygon: TRIANGLE_ID, confidence: CONFIDENCE };

const reflection: FigureSample = {
  id: 'reflection',
  title: 'Reflection in a mirror line',
  figure: figure({
    points: [point('A', 250, 250), point('B', 450, 350), point('C', 300, 550), point('M', 600, 100), point('N', 600, 700)],
    polygons: [triangleABC],
    transformations: [reflect],
  }),
  expect: [
    { kind: 'lands', transformation: 'flip', image: { 'A′': { x: 950, y: 250 }, 'B′': { x: 750, y: 350 }, 'C′': { x: 900, y: 550 } } },
    { kind: 'congruent', transformation: 'flip' },
  ],
};

const rotate: Transformation = { id: 'turn', kind: 'rotate', centre: 'O', degrees: 90, polygon: TRIANGLE_ID, confidence: CONFIDENCE };

const rotation: FigureSample = {
  id: 'rotation',
  title: 'Rotation about a centre',
  figure: figure({
    points: [point('A', 750, 300), point('B', 900, 350), point('C', 800, 500), point('O', 600, 400)],
    segments: triangleSides(),
    polygons: [triangleABC],
    transformations: [rotate],
  }),
  expect: [
    { kind: 'lands', transformation: 'turn', image: { 'A′': { x: 500, y: 250 }, 'B′': { x: 550, y: 100 }, 'C′': { x: 700, y: 200 } } },
    { kind: 'congruent', transformation: 'turn' },
  ],
};

const triangleMessy: FigureSample = {
  id: 'triangle-messy',
  title: 'Angles in a triangle, messy',
  figure: figure({
    points: [point('A', 305, 596), point('B', 794, 607), point('C', 590, 250)],
    segments: triangleSides(),
    polygons: [triangleABC],
    marks: angleSumMarks(),
    labels: [label('tA', 'A', 258, 632), label('tB', 'B', 850, 640), label('tC', 'C', 600, 195), label('t50', '50°', 590, 650)],
  }),
  expect: angleSumExpect,
};

export const GEOMETRY_SAMPLES: readonly FigureSample[] = [triangle, parallel, reflection, rotation, triangleMessy];

export const figureSampleUrl = (id: string): string => `/samples/geo-${id}.png`;
