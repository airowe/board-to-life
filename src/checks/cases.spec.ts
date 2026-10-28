import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAWING_CASES, PHOTO_SIZE, SKETCH_SEED, type DrawingCase } from './cases';
import { observeFallen, SETTLE_SECONDS } from './replay';
import { sketchScene } from './sketch';

const PHOTO_SUFFIX = '-photo';

const repoFile = (path: string): Buffer => readFileSync(new URL(`../../${path}`, import.meta.url));

const pngSize = (bytes: Buffer): { width: number; height: number } => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

const START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2]);

const jpegSize = (bytes: Buffer): { width: number; height: number } => {
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1] ?? 0;
    if (START_OF_FRAME.has(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error('no frame header in JPEG');
};

const imageSize = (drawingCase: DrawingCase) =>
  drawingCase.contentType === 'image/jpeg' ? jpegSize(repoFile(drawingCase.image)) : pngSize(repoFile(drawingCase.image));

const caseById = (id: string): DrawingCase => {
  const found = DRAWING_CASES.find((each) => each.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

const photos = DRAWING_CASES.filter((drawingCase) => drawingCase.photo);

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
    ['table-pulley', 'rope', 'domino-1'],
  ])('%s: the outcome flips without the %s, so it is what decides the result', (caseId, removed, observed) => {
    const drawingCase = caseById(caseId);
    const expected = drawingCase.outcomes.find((outcome) => outcome.item === observed)?.fallen;
    const without = { ...drawingCase.scene, items: drawingCase.scene.items.filter((item) => item.id !== removed), predictPoints: [] };
    expect(observeFallen(without, [observed], SETTLE_SECONDS).get(observed)).toBe(!expected);
  });

  it('spring-swing: the same swing on a rope misses the dominoes, so the stretch is what decides the result', () => {
    const drawingCase = caseById('spring-swing');
    const roped = { ...drawingCase.scene, items: drawingCase.scene.items.map((item) => (item.kind === 'spring' ? { ...item, kind: 'rope' as const } : item)) };
    expect(observeFallen(roped, ['domino-3'], SETTLE_SECONDS).get('domino-3')).toBe(false);
  });

  it('cart-roll: a block given the same push stops short, so the wheels are what decide the result', () => {
    const drawingCase = caseById('cart-roll');
    const blocked = {
      ...drawingCase.scene,
      items: drawingCase.scene.items.map((item) =>
        item.kind === 'cart' ? { id: item.id, kind: 'block' as const, x: item.x, y: item.y + item.wheelRadius, width: item.width, height: item.height, angle: 0, velocity: item.velocity, confidence: item.confidence } : item,
      ),
    };
    expect(observeFallen(blocked, ['domino-3'], SETTLE_SECONDS).get('domino-3')).toBe(false);
  });

  it.each([
    ['swapped', { 'left-block': 1, 'right-block': 5 }],
    ['left off', {}],
  ])('seesaw-masses: with the masses %s the domino stays up, so the written masses decide the result', (_how, masses: Record<string, number>) => {
    const drawingCase = caseById('seesaw-masses');
    const reweighed = {
      ...drawingCase.scene,
      items: drawingCase.scene.items.map((item) => (item.kind === 'block' ? { ...item, mass: masses[item.id] } : item)),
    };
    expect(observeFallen(reweighed, ['domino-1'], SETTLE_SECONDS).get('domino-1')).toBe(false);
  });

  it('has a photo-style variant of every clean drawing', () => {
    const clean = DRAWING_CASES.filter((drawingCase) => !drawingCase.photo).map((drawingCase) => `${drawingCase.id}${PHOTO_SUFFIX}`);
    expect(photos.map((drawingCase) => drawingCase.id)).toEqual(clean);
  });

  describe.each(photos)('$id', (photo) => {
    const clean = caseById(photo.id.slice(0, -PHOTO_SUFFIX.length));

    it('expects the same scene and outcomes as the clean drawing', () => {
      expect({ scene: photo.scene, outcomes: photo.outcomes }).toEqual({ scene: clean.scene, outcomes: clean.outcomes });
    });

    it.runIf(photo.sketch !== null)('carries faint strokes of another, erased drawing', () => {
      expect(photo.sketch?.ghostOf).not.toBeNull();
      expect(photo.sketch?.ghostOf).not.toBe(clean.id);
    });
  });

  describe.each(DRAWING_CASES)('$id', (drawingCase) => {
    it('pins outcomes that the physics computes for the expected scene', () => {
      const items = drawingCase.outcomes.map((outcome) => outcome.item);
      const fallen = observeFallen(drawingCase.scene, items, SETTLE_SECONDS);
      for (const outcome of drawingCase.outcomes) {
        expect({ item: outcome.item, fallen: fallen.get(outcome.item) }).toEqual(outcome);
      }
    });

    it('has an image of the right type and size', () => {
      expect(drawingCase.contentType).toBe(drawingCase.photo ? 'image/jpeg' : 'image/png');
      expect(imageSize(drawingCase)).toEqual(drawingCase.photo ? PHOTO_SIZE : drawingCase.scene.drawing);
    });

    it.runIf(drawingCase.sketch !== null)('has a sketch drawn from exactly the expected scene', () => {
      const sketch = drawingCase.sketch;
      if (!sketch) return;
      const ghost = sketch.ghostOf === null ? undefined : caseById(sketch.ghostOf).scene;
      expect(repoFile(sketch.svg).toString('utf8')).toBe(sketchScene(drawingCase.scene, SKETCH_SEED, ghost));
    });
  });
});
