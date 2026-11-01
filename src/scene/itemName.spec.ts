import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from './fixtures';
import { itemName } from './itemName';
import { validateScene, type Scene } from './schema';

const scene = ((): Scene => {
  const result = validateScene(rampBallDominoes);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.scene;
})();

describe('itemName', () => {
  it.each([
    ['domino-1', 'the first domino'],
    ['domino-3', 'domino 3'],
    ['domino-5', 'the last domino'],
    ['ball', 'the ball'],
  ])('calls %s "%s"', (id, name) => {
    expect(itemName(scene, id)).toBe(name);
  });

  it('counts by place in the scene, whatever the id says', () => {
    const renamed: Scene = {
      ...scene,
      items: scene.items.map((item) => (item.id === 'domino-2' ? { ...item, id: 'tall-one' } : item)),
    };
    expect(itemName(renamed, 'tall-one')).toBe('domino 2');
  });

  it('never shows an id with its hyphen when the item is missing', () => {
    expect(itemName(scene, 'domino-9')).toBe('domino 9');
  });
});
