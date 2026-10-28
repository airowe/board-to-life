import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene, type SceneItem } from '../scene/schema';
import { compareScenes, DEFAULT_TOLERANCE } from './compare';

const DIAGONAL = Math.hypot(1200, 800);
const NUDGE_WITHIN = DIAGONAL * DEFAULT_TOLERANCE * 0.5;
const NUDGE_BEYOND = DIAGONAL * DEFAULT_TOLERANCE * 1.5;
const SCALE = 2;

const sceneFrom = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const expected = sceneFrom(rampBallDominoes);

const editItems = (scene: Scene, edit: (item: SceneItem) => SceneItem | null): Scene => ({
  ...scene,
  items: scene.items.map(edit).filter((item): item is SceneItem => item !== null),
});

const renamed = (scene: Scene): Scene =>
  editItems(scene, (item) => ({ ...item, id: `read-${item.id}` }));

const scaled = (scene: Scene, factor: number): Scene => ({
  ...scene,
  drawing: { width: scene.drawing.width * factor, height: scene.drawing.height * factor },
  items: scene.items.map((item) => {
    switch (item.kind) {
      case 'ramp':
        return { ...item, x1: item.x1 * factor, y1: item.y1 * factor, x2: item.x2 * factor, y2: item.y2 * factor };
      case 'rope':
      case 'spring':
        return item;
      default:
        return { ...item, x: item.x * factor, y: item.y * factor };
    }
  }),
  unknownMarks: scene.unknownMarks.map((mark) => ({
    ...mark,
    x: mark.x * factor,
    y: mark.y * factor,
    width: mark.width * factor,
    height: mark.height * factor,
  })),
});

const moveItem = (scene: Scene, id: string, dx: number): Scene =>
  editItems(scene, (item) => (item.id === id && 'x' in item ? { ...item, x: item.x + dx } : item));

describe('compareScenes', () => {
  it('matches every item of an identical scene with no error', () => {
    const result = compareScenes(expected, expected);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.matched).toHaveLength(expected.items.length);
    expect(Math.max(...result.matched.map((match) => match.error))).toBe(0);
  });

  it('matches items by kind and position, not by id', () => {
    const result = compareScenes(expected, renamed(expected));
    expect(result.idMap.get('domino-5')).toBe('read-domino-5');
    expect(result.missing).toEqual([]);
  });

  it('accepts an item read slightly off and reports how far off it was', () => {
    const result = compareScenes(expected, moveItem(expected, 'domino-3', NUDGE_WITHIN));
    expect(result.missing).toEqual([]);
    expect(result.worstError).toBeCloseTo(NUDGE_WITHIN / DIAGONAL, 6);
  });

  it('treats an item read too far away as missing, with an extra item in its place', () => {
    const result = compareScenes(expected, moveItem(expected, 'domino-3', NUDGE_BEYOND));
    expect(result.missing).toEqual(['domino-3']);
    expect(result.extra).toEqual(['domino-3']);
  });

  it('treats an item read as the wrong kind as missing', () => {
    const misread = editItems(expected, (item) => (item.id === 'domino-5' && item.kind === 'domino' ? { ...item, kind: 'block' as const } : item));
    const result = compareScenes(expected, misread);
    expect(result.missing).toEqual(['domino-5']);
    expect(result.extra).toEqual(['domino-5']);
  });

  it('compares a scene read at another picture size in proportion', () => {
    const result = compareScenes(expected, scaled(expected, SCALE));
    expect(result.missing).toEqual([]);
    expect(result.worstError).toBeCloseTo(0, 9);
  });

  it('matches a ramp read from the other end', () => {
    const flipped = editItems(expected, (item) =>
      item.kind === 'ramp' ? { ...item, x1: item.x2, y1: item.y2, x2: item.x1, y2: item.y1 } : item,
    );
    expect(compareScenes(expected, flipped).missing).toEqual([]);
  });

  it('reports an unknown mark the reader did not flag', () => {
    expect(compareScenes(expected, { ...expected, unknownMarks: [] }).unflagged).toEqual(['mark-1']);
  });

  it('accepts an unknown mark flagged with an overlapping box', () => {
    const shifted = expected.unknownMarks.map((mark) => ({ ...mark, x: mark.x + mark.width / 3 }));
    expect(compareScenes(expected, { ...expected, unknownMarks: shifted }).unflagged).toEqual([]);
  });

  it('reports a body invented inside an unknown mark', () => {
    const invented = { ...expected, items: [...expected.items, { id: 'sun', kind: 'ball' as const, x: 1060, y: 145, radius: 40, confidence: 0.4 }] };
    const result = compareScenes(expected, invented);
    expect(result.invented).toEqual(['sun']);
    expect(result.extra).toEqual(['sun']);
  });

  describe('ropes', () => {
    const roped = sceneFrom({
      ...rampBallDominoes,
      items: [
        ...rampBallDominoes.items,
        { id: 'pulley', kind: 'pulley', x: 300, y: 100, radius: 14, confidence: 0.9 },
        { id: 'rope', kind: 'rope', from: 'pulley', to: 'ball', length: 240, confidence: 0.9 },
      ],
    });

    it('matches a rope that joins the matching items', () => {
      const reversedRope = editItems(renamed(roped), (item) =>
        item.kind === 'rope' ? { ...item, from: 'read-ball', to: 'read-pulley' } : item,
      );
      const result = compareScenes(roped, reversedRope);
      expect(result.missing).toEqual([]);
      expect(result.idMap.get('rope')).toBe('read-rope');
    });

    it('treats a rope tied to the wrong item as missing', () => {
      const wrong = editItems(roped, (item) => (item.kind === 'rope' ? { ...item, to: 'domino-1' } : item));
      const result = compareScenes(roped, wrong);
      expect(result.missing).toEqual(['rope']);
      expect(result.extra).toEqual(['rope']);
    });
  });
});
