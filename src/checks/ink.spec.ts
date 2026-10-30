import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { validateScene } from '../scene/schema';
import { escapeText, seededJitter, towards, wobblyLine } from './ink';
import { sketchScene } from './sketch';

const SKETCH_SEED = 3;
const RECORDED_RAMP_BALL_DOMINOES_SHA256 = 'c6f4da517570797cff89483488cb048206c55d97e787ace387d0226986b97204';
const SAMPLE_SIZE = 5;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('sketchScene after the primitives moved to ink', () => {
  it('draws the ramp, ball and dominoes byte for byte as it did before the move', () => {
    const result = validateScene(rampBallDominoes);
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(sha256(sketchScene(result.scene, SKETCH_SEED))).toBe(RECORDED_RAMP_BALL_DOMINOES_SHA256);
  });
});

describe('seededJitter', () => {
  const draw = (seed: number): number[] => {
    const jitter = seededJitter(seed);
    return Array.from({ length: SAMPLE_SIZE }, () => jitter(10));
  };

  it('repeats the same sequence for the same seed', () => {
    expect(draw(SKETCH_SEED)).toEqual(draw(SKETCH_SEED));
  });

  it('differs between seeds and stays within half the amount either side', () => {
    expect(draw(SKETCH_SEED)).not.toEqual(draw(SKETCH_SEED + 1));
    expect(draw(SKETCH_SEED).every((value) => Math.abs(value) <= 5)).toBe(true);
  });
});

describe('towards', () => {
  it('moves the given distance along the line to the target', () => {
    expect(towards({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toEqual({ x: 6, y: 8 });
  });
});

describe('escapeText', () => {
  it('escapes the characters that would break the SVG', () => {
    expect(escapeText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
});

describe('wobblyLine', () => {
  it('starts as a move command near the start point', () => {
    const path = wobblyLine(seededJitter(SKETCH_SEED), { x: 100, y: 100 }, { x: 300, y: 100 });
    const [x, y] = (path.match(/^M(-?[\d.]+),(-?[\d.]+)/) ?? []).slice(1).map(Number);
    expect(Math.abs((x ?? 0) - 100)).toBeLessThanOrEqual(3);
    expect(Math.abs((y ?? 0) - 100)).toBeLessThanOrEqual(3);
  });
});
