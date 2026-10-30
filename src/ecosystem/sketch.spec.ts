import { describe, expect, it } from 'vitest';
import { sketchWeb } from './sketch';
import { WEB_SAMPLES } from './samples';
import type { Species, Web } from './schema';

const SEED = 7;
const OTHER_SEED = 8;
const EDGE_TOLERANCE = 2;
const MESSY_ID = 'grassland-messy';
const GRASSLAND_ID = 'grassland';

const webOf = (id: string): Web => {
  const sample = WEB_SAMPLES.find((entry) => entry.id === id);
  if (!sample) throw new Error(`no sample ${id}`);
  return sample.web;
};

const grassland = webOf(GRASSLAND_ID);
const messy = webOf(MESSY_ID);
const speciesNamed = (web: Web, id: string): Species => {
  const found = web.species.find((entry) => entry.id === id);
  if (!found) throw new Error(`no species ${id}`);
  return found;
};

const tagsOf = (svg: string, attribute: string): string[] =>
  [...svg.matchAll(new RegExp(`<path ${attribute}="([^"]+)" d="([^"]+)"`, 'g'))].map((match) => `${match[1]}|${match[2]}`);

const pathFor = (svg: string, attribute: string, id: string): string => {
  const found = tagsOf(svg, attribute).find((entry) => entry.startsWith(`${id}|`));
  if (!found) throw new Error(`no ${attribute} ${id}`);
  return found.slice(id.length + 1);
};

const lastPoint = (d: string): { x: number; y: number } => {
  const numbers = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
  const last = numbers[numbers.length - 1];
  return { x: Number(last?.[1]), y: Number(last?.[2]) };
};

const distanceToBoxEdge = (point: { x: number; y: number }, box: Species): number => {
  const dx = Math.abs(point.x - box.x) - box.width / 2;
  const dy = Math.abs(point.y - box.y) - box.height / 2;
  return Math.abs(dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy));
};

describe('sketchWeb', () => {
  const svg = sketchWeb(grassland, SEED);

  it('sizes the picture to the drawing', () => {
    expect(svg).toContain('viewBox="0 0 1200 800" width="1200" height="800"');
  });

  it('writes each species name as text', () => {
    const texts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
    expect(texts.sort()).toEqual(grassland.species.map((entry) => entry.name).sort());
  });

  it('writes names with markup characters escaped', () => {
    const odd: Web = { ...grassland, species: grassland.species.map((entry) => (entry.id === 'fox' ? { ...entry, name: 'fox & <kit>' } : entry)) };
    expect(sketchWeb(odd, SEED)).toContain('fox &amp; &lt;kit&gt;');
  });

  it('draws a wobbly box round each species', () => {
    expect(tagsOf(svg, 'data-box').map((entry) => entry.split('|')[0]).sort()).toEqual(grassland.species.map((entry) => entry.id).sort());
  });

  it('draws one arrowhead per eats', () => {
    expect(tagsOf(svg, 'data-arrowhead').map((entry) => entry.split('|')[0])).toEqual(grassland.eats.map((entry) => entry.id));
  });

  it.each(grassland.eats)('ends arrow $id at the eater\'s box edge, nearer the eater than the eaten', (arrow) => {
    const tip = lastPoint(pathFor(svg, 'data-arrowhead', arrow.id));
    const eater = speciesNamed(grassland, arrow.to);
    const eaten = speciesNamed(grassland, arrow.from);
    expect(distanceToBoxEdge(tip, eater)).toBeLessThanOrEqual(EDGE_TOLERANCE);
    expect(distanceToBoxEdge(tip, eaten)).toBeGreaterThan(EDGE_TOLERANCE);
  });

  it.each(grassland.eats)('starts arrow $id at the eaten species\' box edge', (arrow) => {
    const start = pathFor(svg, 'data-arrow', arrow.id).match(/^M(-?[\d.]+),(-?[\d.]+)/);
    const eaten = speciesNamed(grassland, arrow.from);
    expect(distanceToBoxEdge({ x: Number(start?.[1]), y: Number(start?.[2]) }, eaten)).toBeLessThanOrEqual(EDGE_TOLERANCE);
  });

  describe('unknown marks', () => {
    const marked = sketchWeb(messy, SEED);
    const mark = messy.unknownMarks[0];
    if (!mark) throw new Error('the messy sample needs a mark');
    const inside = (point: { x: number; y: number }): boolean =>
      Math.abs(point.x - mark.x) <= mark.width / 2 && Math.abs(point.y - mark.y) <= mark.height / 2;
    const pointsOf = (d: string): { x: number; y: number }[] =>
      [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

    it('draws each as one arrow path and two crossing strokes inside its box', () => {
      expect(tagsOf(marked, 'data-mark').map((entry) => entry.split('|')[0])).toEqual(messy.unknownMarks.map((entry) => entry.id));
      const crosses = tagsOf(marked, 'data-mark-cross');
      expect(crosses).toHaveLength(2 * messy.unknownMarks.length);
      const strokes = [pathFor(marked, 'data-mark', mark.id), ...crosses.map((entry) => entry.slice(mark.id.length + 1))];
      expect(strokes.flatMap(pointsOf).every(inside)).toBe(true);
    });

    it('crosses the two strokes at the middle of the mark and the arrow passes through them', () => {
      const [first, second] = tagsOf(marked, 'data-mark-cross').map((entry) => pointsOf(entry.slice(mark.id.length + 1)));
      const middle = (points: { x: number; y: number }[] | undefined): { x: number; y: number } => {
        const [a, b] = [points?.[0], points?.[points.length - 1]];
        return { x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 };
      };
      for (const centre of [middle(first), middle(second)]) {
        expect(Math.abs(centre.x - mark.x)).toBeLessThanOrEqual(EDGE_TOLERANCE);
        expect(Math.abs(centre.y - mark.y)).toBeLessThanOrEqual(EDGE_TOLERANCE);
      }
      const shaft = pointsOf(pathFor(marked, 'data-mark', mark.id));
      expect(Math.min(...shaft.map((point) => point.x))).toBeLessThan(mark.x);
      expect(Math.max(...shaft.map((point) => point.x))).toBeGreaterThan(mark.x);
    });

    it('draws nothing for a web without marks', () => {
      expect(tagsOf(svg, 'data-mark')).toEqual([]);
      expect(tagsOf(svg, 'data-mark-cross')).toEqual([]);
    });
  });

  it('draws the same strokes for the same seed and others for another seed', () => {
    expect(sketchWeb(grassland, SEED)).toBe(svg);
    expect(sketchWeb(grassland, OTHER_SEED)).not.toBe(svg);
  });
});
