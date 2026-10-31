import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene } from '../scene/schema';
import { sketchScene } from './sketch';

const SEED = 3;
const OTHER_SEED = 4;

const sceneFrom = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const sample = sceneFrom(rampBallDominoes);

const withRope = sceneFrom({
  ...rampBallDominoes,
  items: [
    ...rampBallDominoes.items,
    { id: 'pulley', kind: 'pulley', x: 300, y: 100, radius: 14, confidence: 0.9 },
    { id: 'hanging', kind: 'ball', x: 300, y: 300, radius: 20, confidence: 0.9 },
    { id: 'rope', kind: 'rope', from: 'pulley', to: 'hanging', length: 200, confidence: 0.9 },
  ],
});

const attribute = (svg: string, name: string): string[] =>
  [...svg.matchAll(new RegExp(`${name}="([^"]+)"`, 'g'))].map((match) => match[1] ?? '');

describe('sketchScene', () => {
  it('draws the same strokes for the same seed', () => {
    expect(sketchScene(sample, SEED)).toBe(sketchScene(sample, SEED));
  });

  it('wobbles differently for another seed', () => {
    expect(sketchScene(sample, SEED)).not.toBe(sketchScene(sample, OTHER_SEED));
  });

  it('uses the drawing size for the picture', () => {
    expect(sketchScene(sample, SEED)).toContain('viewBox="0 0 1200 800" width="1200" height="800"');
  });

  it('draws every item once', () => {
    const drawn = attribute(sketchScene(withRope, SEED), 'data-item');
    expect(drawn.sort()).toEqual(withRope.items.map((item) => item.id).sort());
  });

  it('hatches walls, and only walls, so they read as fixed', () => {
    expect(attribute(sketchScene(sample, SEED), 'data-hatch')).toEqual(sample.items.filter((item) => item.kind === 'wall').map((item) => item.id));
  });

  it('draws an arrow for each initial velocity', () => {
    expect(attribute(sketchScene(sample, SEED), 'data-arrow')).toEqual(['ball']);
  });

  it('scribbles each unknown mark inside its box', () => {
    expect(attribute(sketchScene(sample, SEED), 'data-mark')).toEqual(['mark-1']);
  });

  it('draws an erased drawing underneath as faint ghost strokes, not as items', () => {
    const svg = sketchScene(sample, SEED, withRope);
    expect(attribute(svg, 'data-ghost').sort()).toEqual(withRope.items.map((item) => item.id).sort());
    expect(attribute(svg, 'data-item').sort()).toEqual(sample.items.map((item) => item.id).sort());
  });

  it('draws nothing extra without a ghost', () => {
    expect(attribute(sketchScene(sample, SEED), 'data-ghost')).toEqual([]);
  });

  it('writes the labels, escaping markup', () => {
    const scene = sceneFrom({ ...rampBallDominoes, labels: [{ id: 'l', text: 'a < b & c', x: 10, y: 10, confidence: 1 }] });
    expect(sketchScene(scene, SEED)).toContain('>a &lt; b &amp; c</text>');
  });

  it('escapes item ids so a quote or bracket cannot break the markup', () => {
    const nasty = '"><x';
    const scene = sceneFrom({
      ...rampBallDominoes,
      items: rampBallDominoes.items.map((item) => (item.id === 'domino-3' ? { ...item, id: nasty } : item)),
    });
    const svg = sketchScene(scene, SEED);
    expect(svg).not.toContain(nasty);
    expect(svg).toContain('data-item="&quot;&gt;&lt;x"');
  });
});
