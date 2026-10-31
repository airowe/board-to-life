import { describe, expect, it } from 'vitest';
import { imageOf, positionsOf } from './derive';
import { GEOMETRY_SAMPLES } from './samples';
import { sketchFigure } from './sketch';
import type { Figure } from './schema';

const SEED = 7;
const OTHER_SEED = 8;
const MESSY_ID = 'triangle-messy';
const CLEAN_TRIANGLE_ID = 'triangle';
const ROTATION_DEGREES = 90;
const TICKS_PER_SEGMENT = 2;
const ARROWHEADS_PER_PARALLEL_LINE = 2;

const figureOf = (id: string): Figure => {
  const sample = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (!sample) throw new Error(`no sample ${id}`);
  return sample.figure;
};

const textsOf = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');

const count = (svg: string, attribute: string): number => svg.split(`<path ${attribute}=`).length - 1;

const withParts = (base: Figure, parts: Partial<Figure>): Figure => ({ ...base, ...parts });

const triangle = figureOf(CLEAN_TRIANGLE_ID);
const parallel = figureOf('parallel');
const reflection = figureOf('reflection');
const rotation = figureOf('rotation');
const messy = figureOf(MESSY_ID);

describe('sketchFigure', () => {
  it('sizes the picture to the drawing', () => {
    const { width, height } = triangle.drawing;
    expect(sketchFigure(triangle, SEED)).toContain(`viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`);
  });

  it('writes each named point letter and none for ids like P1', () => {
    const letters = textsOf(sketchFigure(parallel, SEED)).filter((entry) => /^[A-Z]$/.test(entry));
    expect(letters.sort()).toEqual(['P', 'Q', 'R', 'S', 'T', 'U']);
    expect(textsOf(sketchFigure(parallel, SEED))).not.toContain('P1');
  });

  it('uses a label in place of the default point letter', () => {
    const letters = textsOf(sketchFigure(messy, SEED)).filter((entry) => entry === 'A');
    expect(letters).toEqual(['A']);
    const svg = sketchFigure(messy, SEED);
    const letter = messy.labels.find((entry) => entry.text === 'A');
    expect(letter).toBeDefined();
    expect(svg).toContain(`x="${letter?.x}" y="${letter?.y}"`);
    expect(svg.match(/data-point-letter="A"/g)).toBeNull();
  });

  it('draws one path per segment, line, ray, circle and polygon edge', () => {
    const rich = withParts(parallel, {
      segments: [{ id: 's1', from: 'P', to: 'R', confidence: 1 }],
      rays: [{ id: 'r1', from: 'R', to: 'S', confidence: 1 }],
      circles: [
        { id: 'c1', centre: 'P', radius: 50, confidence: 1 },
        { id: 'c2', centre: 'Q', through: 'S', confidence: 1 },
      ],
      polygons: [{ id: 'poly', vertices: ['P', 'Q', 'S', 'R'], confidence: 1 }],
    });
    const svg = sketchFigure(rich, SEED);
    expect(count(svg, 'data-segment')).toBe(1);
    expect(count(svg, 'data-line')).toBe(3);
    expect(count(svg, 'data-ray')).toBe(1);
    expect(count(svg, 'data-circle')).toBe(2);
    expect(count(svg, 'data-edge')).toBe(4);
  });

  it('draws an arc per angle mark with its written value unless a label already says it', () => {
    const clean = sketchFigure(triangle, SEED);
    expect(count(clean, 'data-angle')).toBe(3);
    expect(textsOf(clean)).toEqual(expect.arrayContaining(['50°', '60°']));
    const messySvg = sketchFigure(messy, SEED);
    expect(count(messySvg, 'data-angle')).toBe(3);
    expect(textsOf(messySvg).filter((entry) => entry === '50°')).toHaveLength(1);
    expect(textsOf(messySvg)).toContain('60°');
  });

  it('draws a square per right mark', () => {
    const withRight = withParts(triangle, { marks: [{ id: 'r', kind: 'right', at: 'B', from: 'A', to: 'C', confidence: 1 }] });
    expect(count(sketchFigure(withRight, SEED), 'data-right')).toBe(1);
  });

  it('draws ticks per equal mark and arrowheads per parallel mark', () => {
    const withEqual = withParts(triangle, {
      marks: [{ id: 'e', kind: 'equal', segments: [['A', 'B'], ['B', 'C']], ticks: TICKS_PER_SEGMENT, confidence: 1 }],
    });
    expect(count(sketchFigure(withEqual, SEED), 'data-tick')).toBe(2 * TICKS_PER_SEGMENT);
    expect(count(sketchFigure(parallel, SEED), 'data-parallel')).toBe(ARROWHEADS_PER_PARALLEL_LINE);
  });

  it('draws a reflection mirror line dashed', () => {
    const svg = sketchFigure(reflection, SEED);
    expect(svg).toMatch(/<path data-mirror="flip" stroke-dasharray="[^"]+" d=/);
  });

  it('draws the mirror once, with no solid line or doubled triangle side under it', () => {
    const svg = sketchFigure(reflection, SEED);
    expect(count(svg, 'data-line')).toBe(0);
    expect(count(svg, 'data-segment')).toBe(0);
    expect(count(svg, 'data-edge')).toBe(3);
  });

  it('draws a rotation centre with a curved arrow and the degrees', () => {
    const svg = sketchFigure(rotation, SEED);
    expect(count(svg, 'data-centre')).toBe(1);
    expect(count(svg, 'data-turn')).toBe(1);
    expect(textsOf(svg)).toContain(`${ROTATION_DEGREES}°`);
  });

  it('draws a translation arrow', () => {
    const translated = withParts(triangle, {
      points: [...triangle.points, { id: 'U', x: 100, y: 100, confidence: 1 }, { id: 'V', x: 300, y: 150, confidence: 1 }],
      transformations: [{ id: 'slide', kind: 'translate', from: 'U', to: 'V', polygon: 'abc', confidence: 1 }],
    });
    expect(count(sketchFigure(translated, SEED), 'data-translate')).toBe(1);
  });

  it('draws a scribble per unknownMarks entry', () => {
    const scribbled = withParts(triangle, {
      unknownMarks: [{ id: 'u', x: 900, y: 200, width: 120, height: 80, note: 'smudge', confidence: 1 }],
    });
    expect(count(sketchFigure(scribbled, SEED), 'data-unknown')).toBe(1);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(sketchFigure(messy, SEED)).toBe(sketchFigure(messy, SEED));
    expect(sketchFigure(messy, SEED)).not.toBe(sketchFigure(messy, OTHER_SEED));
  });

  it.each([ROTATION_DEGREES, -ROTATION_DEGREES])('curves the turn arrow the way %i degrees moves the triangle', (degrees) => {
    const turned = withParts(rotation, {
      transformations: rotation.transformations.map((entry) => (entry.kind === 'rotate' ? { ...entry, degrees } : entry)),
    });
    const transformation = turned.transformations[0];
    const polygon = turned.polygons[0];
    if (transformation?.kind !== 'rotate' || polygon === undefined) throw new Error('rotation sample changed shape');
    const positions = positionsOf(turned);
    const centre = positions[transformation.centre];
    const vertex = positions[polygon.vertices[0] ?? ''];
    const image = imageOf(positions, transformation, polygon)[`${polygon.vertices[0]}′`];
    if (!centre || !vertex || !image) throw new Error('rotation sample is missing points');
    const side = (from: { x: number; y: number }, to: { x: number; y: number }): number =>
      Math.sign((from.x - centre.x) * (to.y - centre.y) - (from.y - centre.y) * (to.x - centre.x));
    const arcPath = sketchFigure(turned, SEED).match(/<path data-turn="[^"]*" d="([^"]*)"/)?.[1] ?? '';
    const [start, next] = arcPath
      .replace(/^M/, '')
      .split(' L')
      .slice(0, 2)
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number);
        return { x: x ?? Number.NaN, y: y ?? Number.NaN };
      });
    if (!start || !next) throw new Error('turn arc has no points');
    expect(side(start, next)).toBe(side(vertex, image));
    expect(side(start, next)).not.toBe(0);
  });

  it('marks a dilation centre with a cross and nothing else', () => {
    const dilated = withParts(triangle, {
      points: [...triangle.points, { id: 'O', x: 100, y: 100, confidence: 1 }],
      transformations: [{ id: 'grow', kind: 'dilate', centre: 'O', factor: 2, polygon: 'abc', confidence: 1 }],
    });
    const svg = sketchFigure(dilated, SEED);
    expect(count(svg, 'data-centre')).toBe(1);
    expect(count(svg, 'data-turn')).toBe(0);
    expect(count(svg, 'data-mirror')).toBe(0);
    expect(count(svg, 'data-translate')).toBe(0);
  });
});
