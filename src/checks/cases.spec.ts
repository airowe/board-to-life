import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAWING_CASES, SKETCH_SEED } from './cases';
import { observeFallen, SETTLE_SECONDS } from './replay';
import { sketchScene } from './sketch';

const repoFile = (path: string): Buffer => readFileSync(new URL(`../../${path}`, import.meta.url));

const pngSize = (bytes: Buffer): { width: number; height: number } => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

describe('drawing check cases', () => {
  it('have unique ids', () => {
    const ids = DRAWING_CASES.map((drawingCase) => drawingCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('include outcomes that fall and outcomes that stay standing, so a reader cannot pass by always guessing one', () => {
    const results = DRAWING_CASES.flatMap((drawingCase) => drawingCase.outcomes.map((outcome) => outcome.fallen));
    expect(results).toContain(true);
    expect(results).toContain(false);
  });

  it.each([
    ['wall-in-the-way', 'wall', 'domino-1'],
    ['pendulum-knock', 'rope', 'domino-3'],
  ])('%s: the outcome flips without the %s, so it is what decides the result', (caseId, removed, observed) => {
    const drawingCase = DRAWING_CASES.find((each) => each.id === caseId);
    if (!drawingCase) throw new Error(`no case ${caseId}`);
    const expected = drawingCase.outcomes.find((outcome) => outcome.item === observed)?.fallen;
    const without = { ...drawingCase.scene, items: drawingCase.scene.items.filter((item) => item.id !== removed), predictPoints: [] };
    expect(observeFallen(without, [observed], SETTLE_SECONDS).get(observed)).toBe(!expected);
  });

  describe.each(DRAWING_CASES)('$id', (drawingCase) => {
    it('pins outcomes that the physics computes for the expected scene', () => {
      const items = drawingCase.outcomes.map((outcome) => outcome.item);
      const fallen = observeFallen(drawingCase.scene, items, SETTLE_SECONDS);
      for (const outcome of drawingCase.outcomes) {
        expect({ item: outcome.item, fallen: fallen.get(outcome.item) }).toEqual(outcome);
      }
    });

    it('has a photo at the drawing size', () => {
      expect(pngSize(repoFile(drawingCase.image))).toEqual(drawingCase.scene.drawing);
    });

    it.runIf(drawingCase.sketched)('has a sketch drawn from exactly the expected scene', () => {
      const svgPath = drawingCase.image.replace(/\.png$/, '.svg');
      expect(repoFile(svgPath).toString('utf8')).toBe(sketchScene(drawingCase.scene, SKETCH_SEED));
    });
  });
});
