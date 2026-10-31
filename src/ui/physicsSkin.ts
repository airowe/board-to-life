import type { BodySnapshot } from '../physics/simulation';
import type { Library } from '../library/manifest';
import { libraryFile } from '../library/match';
import {
  backgroundFloor,
  backgroundPlacement,
  boardFloorY,
  brickTileSize,
  physicsSubject,
  PHYSICS_BACKGROUND,
  pictureFit,
  pictureRect,
  spriteBox,
  type PhysicsSkin,
  type SpriteBox,
} from '../living/physicsPictures';
import type { View } from '../present/view';
import { isLink, type Scene, type SceneItem } from '../scene/schema';
import { createPlaceImages, type PlaceImages } from './placeView';

// Tunable by eye: ropes drawn as twine and springs as steel over the pictures.
export const ROPE_INK = '#8a6236';
export const SPRING_INK = '#6f7a86';
// Shown on the skin button: it names the skin a press switches to.
export const SKIN_LABELS: Record<PhysicsSkin, string> = {
  pictures: 'Show the pictures',
  photo: 'Show it on the photo',
  clean: 'Show the clean drawing',
};

// Fixed things sit at the back, ropes run over them, and what moves is drawn on top, covering the rope ends.
const MOVING_KINDS: readonly SceneItem['kind'][] = ['ball', 'block', 'domino', 'cart', 'lever'];
const layerOf = (item: SceneItem): number => (isLink(item) ? 1 : MOVING_KINDS.includes(item.kind) ? 2 : 0);

// Patterns belong to the canvas they were made on; the presenter draws on a single canvas.
export type PhysicsPictures = { library: Library; images: PlaceImages; files: Map<string, string | null>; bricks: CanvasPattern | null };

export const createPhysicsPictures = (library: Library, onLoad: () => void): PhysicsPictures => ({
  library,
  images: createPlaceImages(onLoad),
  files: new Map(),
  bricks: null,
});

const pictureOf = (pictures: PhysicsPictures, subject: string): HTMLImageElement | null => {
  if (!pictures.files.has(subject)) pictures.files.set(subject, libraryFile(pictures.library, subject, 'rest'));
  const file = pictures.files.get(subject);
  return file ? pictures.images.get(file) : null;
};

// A wall is filled with courses of bricks at one fixed size, clipped to its box, so a tall thin wall is not a squashed picture.
const brickPattern = (ctx: CanvasRenderingContext2D, pictures: PhysicsPictures, image: HTMLImageElement): CanvasPattern | null => {
  if (pictures.bricks) return pictures.bricks;
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) return null;
  const tile = brickTileSize({ width: image.naturalWidth, height: image.naturalHeight });
  pattern.setTransform(new DOMMatrix().scale(tile.width / image.naturalWidth, tile.height / image.naturalHeight));
  pictures.bricks = pattern;
  return pattern;
};

const drawPicture = (ctx: CanvasRenderingContext2D, pictures: PhysicsPictures, subject: string, image: HTMLImageElement, box: SpriteBox): void => {
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.angle);
  const bricks = subject === 'brick-wall' ? brickPattern(ctx, pictures, image) : null;
  if (bricks) {
    // The pattern starts at the wall's top left corner, so a wall begins on a whole course.
    ctx.translate(-box.width / 2, -box.height / 2);
    ctx.fillStyle = bricks;
    ctx.fillRect(0, 0, box.width, box.height);
  } else {
    const rect = pictureRect(box, { width: image.naturalWidth, height: image.naturalHeight }, pictureFit(subject));
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();
};

// The tabletop behind everything, in canvas (CSS) pixels, with its floor laid on the board's floor where it can be.
// False until the picture has loaded.
export const drawBackdrop = (ctx: CanvasRenderingContext2D, pictures: PhysicsPictures, screen: { width: number; height: number }, view: View, scene: Scene): boolean => {
  const image = pictureOf(pictures, PHYSICS_BACKGROUND);
  if (!image) return false;
  const background = backgroundFloor({ width: image.naturalWidth, height: image.naturalHeight });
  const placement = backgroundPlacement(screen, background, view.offsetY + boardFloorY(scene) * view.scale);
  ctx.drawImage(image, placement.offsetX, placement.offsetY, background.width * placement.scale, background.height * placement.scale);
  return true;
};

// Each item as its library picture fitted to its sprite box (walls as bricks); ropes, springs and any picture still loading
// fall back to the clean drawing. The floor is the backdrop's own, unless the backdrop has not loaded.
export const drawPictureItems = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  bodies: Map<string, BodySnapshot>,
  pictures: PhysicsPictures,
  backdrop: boolean,
  drawPlain: (item: SceneItem, ink?: string) => void,
): void => {
  const ordered = [...scene.items].sort((a, b) => layerOf(a) - layerOf(b));
  for (const item of ordered) {
    if (item.kind === 'rope' || item.kind === 'spring') {
      drawPlain(item, item.kind === 'rope' ? ROPE_INK : SPRING_INK);
      continue;
    }
    if (item.kind === 'floor' && backdrop) continue;
    const subject = physicsSubject(item, scene);
    const image = subject ? pictureOf(pictures, subject) : null;
    const box = spriteBox(item, bodies.get(item.id));
    if (!subject || !image || !box) drawPlain(item);
    else drawPicture(ctx, pictures, subject, image, box);
  }
};
