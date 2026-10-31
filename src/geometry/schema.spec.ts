import { describe, expect, it } from 'vitest';
import { MAX_FIGURE_ITEMS, validateFigure, type Figure } from './schema';

const CONFIDENCE = 0.9;
const DRAWING = { width: 1000, height: 1000 };

const point = (id: string, x: number, y: number) => ({ id, x, y, confidence: CONFIDENCE });

const triangleFigure = (): Figure => ({
  version: 1,
  drawing: DRAWING,
  points: [point('A', 100, 800), point('B', 700, 800), point('C', 400, 200)],
  segments: [
    { id: 'AB', from: 'A', to: 'B', confidence: CONFIDENCE },
    { id: 'BC', from: 'B', to: 'C', confidence: CONFIDENCE },
    { id: 'CA', from: 'C', to: 'A', confidence: CONFIDENCE },
  ],
  lines: [],
  rays: [],
  circles: [],
  polygons: [{ id: 'ABC', vertices: ['A', 'B', 'C'], confidence: CONFIDENCE }],
  marks: [
    { id: 'm1', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 50, confidence: CONFIDENCE },
    { id: 'm2', kind: 'angle', at: 'B', from: 'C', to: 'A', confidence: CONFIDENCE },
  ],
  transformations: [],
  labels: [{ id: 'l1', text: '50°', x: 140, y: 760, confidence: CONFIDENCE }],
  unknownMarks: [{ id: 'u1', note: 'smudge', x: 10, y: 10, width: 20, height: 20, confidence: 0.3 }],
  focus: null,
});

const errorsFor = (input: unknown): string[] => {
  const result = validateFigure(input);
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
};

const withChange = (change: (figure: Figure) => void): Figure => {
  const figure = triangleFigure();
  change(figure);
  return figure;
};

const reflectedTriangle = (): Figure =>
  withChange((figure) => {
    figure.transformations = [{ id: 'T1', kind: 'reflect', mirror: ['A', 'C'], polygon: 'ABC', confidence: CONFIDENCE }];
  });

describe('validateFigure', () => {
  it('accepts a triangle with angle marks and returns it unchanged', () => {
    const figure = triangleFigure();
    expect(validateFigure(figure)).toEqual({ ok: true, figure });
  });

  it('accepts every mark and transformation kind and each focus kind', () => {
    const figure = withChange((f) => {
      f.points.push(point('O', 500, 500));
      f.lines = [{ id: 'L1', from: 'A', to: 'B', confidence: CONFIDENCE }];
      f.rays = [{ id: 'R1', from: 'A', to: 'C', confidence: CONFIDENCE }];
      f.circles = [
        { id: 'K1', centre: 'O', radius: 120, confidence: CONFIDENCE },
        { id: 'K2', centre: 'O', through: 'A', confidence: CONFIDENCE },
      ];
      f.marks.push(
        { id: 'm3', kind: 'right', at: 'B', from: 'A', to: 'C', confidence: CONFIDENCE },
        { id: 'm4', kind: 'length', from: 'A', to: 'B', value: 6, unit: 'cm', confidence: CONFIDENCE },
        { id: 'm5', kind: 'equal', segments: [['A', 'B'], ['B', 'C']], ticks: 1, confidence: CONFIDENCE },
        { id: 'm6', kind: 'parallel', lines: [['A', 'B'], ['C', 'O']], confidence: CONFIDENCE },
      );
      f.transformations = [
        { id: 'T1', kind: 'reflect', mirror: ['A', 'C'], polygon: 'ABC', confidence: CONFIDENCE },
        { id: 'T2', kind: 'rotate', centre: 'O', degrees: -90, polygon: 'ABC', confidence: CONFIDENCE },
        { id: 'T3', kind: 'translate', from: 'A', to: 'B', polygon: 'ABC', confidence: CONFIDENCE },
        { id: 'T4', kind: 'dilate', centre: 'O', factor: 2, polygon: 'ABC', confidence: CONFIDENCE },
      ];
    });
    const focuses: Figure['focus'][] = [
      { kind: 'transform', transformation: 'T2' },
      { kind: 'angle-sum', polygon: 'ABC', drag: 'C' },
      { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'C' },
    ];
    for (const focus of focuses) {
      expect(validateFigure({ ...figure, focus })).toEqual({ ok: true, figure: { ...figure, focus } });
    }
  });

  it('rejects a figure with no points', () => {
    const figure = withChange((f) => {
      f.points = [];
      f.segments = [];
      f.polygons = [];
      f.marks = [];
    });
    expect(errorsFor(figure)).toEqual(['The figure needs at least one named point.']);
  });

  it('rejects a duplicate point id and names it', () => {
    const figure = withChange((f) => f.points.push(point('A', 1, 1)));
    expect(errorsFor(figure)).toEqual(['duplicate id "A"']);
  });

  it('rejects an id shared by a point and a polygon', () => {
    const figure = withChange((f) => f.polygons.push({ id: 'A', vertices: ['A', 'B', 'C'], confidence: CONFIDENCE }));
    expect(errorsFor(figure)).toEqual(['duplicate id "A"']);
  });

  const missingPointCases: [string, (figure: Figure) => void, string][] = [
    ['segment', (f) => { f.segments[0] = { id: 'AB', from: 'A', to: 'Z', confidence: CONFIDENCE }; }, 'segment "AB" references missing point "Z"'],
    ['line', (f) => { f.lines = [{ id: 'L1', from: 'Z', to: 'B', confidence: CONFIDENCE }]; }, 'line "L1" references missing point "Z"'],
    ['ray', (f) => { f.rays = [{ id: 'R1', from: 'A', to: 'Z', confidence: CONFIDENCE }]; }, 'ray "R1" references missing point "Z"'],
    ['polygon vertex', (f) => { f.polygons[0] = { id: 'ABC', vertices: ['A', 'B', 'Z'], confidence: CONFIDENCE }; }, 'polygon "ABC" references missing point "Z"'],
    ['circle centre', (f) => { f.circles = [{ id: 'K1', centre: 'Z', radius: 5, confidence: CONFIDENCE }]; }, 'circle "K1" references missing point "Z"'],
    ['circle through', (f) => { f.circles = [{ id: 'K1', centre: 'A', through: 'Z', confidence: CONFIDENCE }]; }, 'circle "K1" references missing point "Z"'],
    ['angle mark', (f) => { f.marks[0] = { id: 'm1', kind: 'angle', at: 'Z', from: 'B', to: 'C', confidence: CONFIDENCE }; }, 'mark "m1" references missing point "Z"'],
    ['length mark', (f) => { f.marks.push({ id: 'm9', kind: 'length', from: 'A', to: 'Z', confidence: CONFIDENCE }); }, 'mark "m9" references missing point "Z"'],
    ['equal mark', (f) => { f.marks.push({ id: 'm9', kind: 'equal', segments: [['A', 'B'], ['B', 'Z']], ticks: 1, confidence: CONFIDENCE }); }, 'mark "m9" references missing point "Z"'],
    ['parallel mark', (f) => { f.marks.push({ id: 'm9', kind: 'parallel', lines: [['A', 'B'], ['Z', 'C']], confidence: CONFIDENCE }); }, 'mark "m9" references missing point "Z"'],
    ['reflect mirror', (f) => { f.transformations = [{ id: 'T1', kind: 'reflect', mirror: ['A', 'Z'], polygon: 'ABC', confidence: CONFIDENCE }]; }, 'transformation "T1" references missing point "Z"'],
    ['rotate centre', (f) => { f.transformations = [{ id: 'T1', kind: 'rotate', centre: 'Z', degrees: 90, polygon: 'ABC', confidence: CONFIDENCE }]; }, 'transformation "T1" references missing point "Z"'],
    ['translate tip', (f) => { f.transformations = [{ id: 'T1', kind: 'translate', from: 'A', to: 'Z', polygon: 'ABC', confidence: CONFIDENCE }]; }, 'transformation "T1" references missing point "Z"'],
    ['dilate centre', (f) => { f.transformations = [{ id: 'T1', kind: 'dilate', centre: 'Z', factor: 2, polygon: 'ABC', confidence: CONFIDENCE }]; }, 'transformation "T1" references missing point "Z"'],
  ];

  it.each(missingPointCases)('rejects a %s citing a missing point and names both ids', (_name, change, message) => {
    expect(errorsFor(withChange(change))).toEqual([message]);
  });

  it('rejects a polygon with fewer than 3 vertices and names it', () => {
    const figure = withChange((f) => { f.polygons[0] = { id: 'ABC', vertices: ['A', 'B'], confidence: CONFIDENCE }; });
    expect(errorsFor(figure)).toEqual(['polygons ABC vertices: Too small: expected array to have >=3 items']);
  });

  it('rejects a circle with both radius and through', () => {
    const figure = withChange((f) => { f.circles = [{ id: 'K1', centre: 'A', radius: 5, through: 'B', confidence: CONFIDENCE }]; });
    expect(errorsFor(figure)).toEqual(['circle "K1" needs exactly one of radius or through']);
  });

  it('rejects a circle with neither radius nor through', () => {
    const figure = withChange((f) => { f.circles = [{ id: 'K1', centre: 'A', confidence: CONFIDENCE }]; });
    expect(errorsFor(figure)).toEqual(['circle "K1" needs exactly one of radius or through']);
  });

  it('rejects a transformation citing a missing polygon', () => {
    const figure = withChange((f) => { f.transformations = [{ id: 'T1', kind: 'rotate', centre: 'A', degrees: 90, polygon: 'XYZ', confidence: CONFIDENCE }]; });
    expect(errorsFor(figure)).toEqual(['transformation "T1" references missing polygon "XYZ"']);
  });

  it.each([0, -2])('rejects a dilation factor of %s and names the transformation', (factor) => {
    const figure = withChange((f) => { f.transformations = [{ id: 'T1', kind: 'dilate', centre: 'A', factor, polygon: 'ABC', confidence: CONFIDENCE }]; });
    expect(errorsFor(figure)).toEqual(['transformations T1 factor: Too small: expected number to be >0']);
  });

  const missingFocusCases: [string, Figure['focus'], string][] = [
    ['transformation', { kind: 'transform', transformation: 'T9' }, 'focus references missing transformation "T9"'],
    ['polygon', { kind: 'angle-sum', polygon: 'XYZ', drag: 'C' }, 'focus references missing polygon "XYZ"'],
    ['drag point on angle-sum', { kind: 'angle-sum', polygon: 'ABC', drag: 'Z' }, 'focus references missing point "Z"'],
    ['mark', { kind: 'equal-angles', marks: ['m1', 'm9'], drag: 'C' }, 'focus references missing mark "m9"'],
    ['drag point on equal-angles', { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'Z' }, 'focus references missing point "Z"'],
  ];

  it.each(missingFocusCases)('rejects a focus citing a missing %s', (_name, focus, message) => {
    expect(errorsFor({ ...reflectedTriangle(), focus })).toEqual([message]);
  });

  it('rejects a focus transform citing an id that is not a transformation', () => {
    expect(errorsFor({ ...reflectedTriangle(), focus: { kind: 'transform', transformation: 'ABC' } })).toEqual([
      'focus references missing transformation "ABC"',
    ]);
  });

  it('rejects a polygon that repeats a vertex and names both', () => {
    const figure = withChange((f) => { f.polygons[0] = { id: 'ABC', vertices: ['A', 'B', 'C', 'A'], confidence: CONFIDENCE }; });
    expect(errorsFor(figure)).toEqual(['polygon "ABC" repeats vertex "A"']);
  });

  it.each([0, -3])('rejects a written length of %s and names the mark', (value) => {
    const figure = withChange((f) => { f.marks.push({ id: 'm9', kind: 'length', from: 'A', to: 'B', value, confidence: CONFIDENCE }); });
    expect(errorsFor(figure)).toEqual(['marks m9 value: Too small: expected number to be >0']);
  });

  const STRAIGHT_ANGLE = 180;
  const RIGHT_ANGLE = 90;

  it.each([
    [0, 'Too small: expected number to be >0'],
    [-40, 'Too small: expected number to be >0'],
    [STRAIGHT_ANGLE + 1, `Too big: expected number to be <=${STRAIGHT_ANGLE}`],
  ])('rejects a written angle of %s degrees and names the mark', (degrees, message) => {
    const figure = withChange((f) => { f.marks[0] = { id: 'm1', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees, confidence: CONFIDENCE }; });
    expect(errorsFor(figure)).toEqual([`marks m1 degrees: ${message}`]);
  });

  it.each([RIGHT_ANGLE, STRAIGHT_ANGLE])('accepts a written angle of %s degrees', (degrees) => {
    const figure = withChange((f) => { f.marks[0] = { id: 'm1', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees, confidence: CONFIDENCE }; });
    expect(validateFigure(figure)).toEqual({ ok: true, figure });
  });

  it('rejects an equal-angles focus whose marks are not angle marks and names them', () => {
    const figure = withChange((f) => {
      f.marks.push(
        { id: 'm8', kind: 'length', from: 'A', to: 'B', confidence: CONFIDENCE },
        { id: 'm9', kind: 'right', at: 'B', from: 'A', to: 'C', confidence: CONFIDENCE },
      );
      f.focus = { kind: 'equal-angles', marks: ['m8', 'm9'], drag: 'C' };
    });
    expect(errorsFor(figure)).toEqual(['focus mark "m8" is not an angle mark', 'focus mark "m9" is not an angle mark']);
  });

  it('rejects a confidence above 1 and names the point', () => {
    const figure = withChange((f) => { f.points[0] = point('A', 100, 800); f.points[0].confidence = 1.5; });
    expect(errorsFor(figure)).toEqual(['points A confidence: Too big: expected number to be <=1']);
  });
});

describe('validateFigure collection sizes', () => {
  const manyPoints = (count: number) => Array.from({ length: count }, (_, index) => point(`X${index}`, index, index));
  const manyLabels = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `t${index}`, text: 'x', x: 1, y: 1, confidence: CONFIDENCE }));

  it('caps each collection at 200 items', () => {
    expect(MAX_FIGURE_ITEMS).toBe(200);
  });

  it('accepts a collection of exactly the maximum', () => {
    const figure = triangleFigure();
    expect(validateFigure({ ...figure, labels: manyLabels(MAX_FIGURE_ITEMS) })).toMatchObject({ ok: true });
  });

  it.each([
    ['points', (figure: Figure) => ({ ...figure, points: [...figure.points, ...manyPoints(MAX_FIGURE_ITEMS)] })],
    ['labels', (figure: Figure) => ({ ...figure, labels: manyLabels(MAX_FIGURE_ITEMS + 1) })],
  ] as const)('rejects too many %s with an error naming the collection', (collection, grow) => {
    const result = validateFigure(grow(triangleFigure()));
    expect(result).toEqual({ ok: false, errors: [`${collection}: at most ${MAX_FIGURE_ITEMS} ${collection} are allowed`] });
  });

  it('rejects a polygon with too many vertices', () => {
    const figure = triangleFigure();
    const vertices = Array.from({ length: MAX_FIGURE_ITEMS + 1 }, (_, index) => figure.points[index % figure.points.length]?.id ?? 'A');
    const result = validateFigure({ ...figure, polygons: [{ id: 'big', vertices, confidence: CONFIDENCE }] });
    expect(result).toEqual({ ok: false, errors: [`polygons big vertices: at most ${MAX_FIGURE_ITEMS} vertices are allowed`] });
  });
});
