import type { BodySnapshot } from '../physics/simulation';
import type { Library } from '../library/manifest';
import { libraryFile } from '../library/match';
import { backgroundFloor, backgroundPlacement, boardFloorY, physicsSubject, PHYSICS_BACKGROUND, spriteBox, type PhysicsSkin } from '../living/physicsPictures';
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

export type PhysicsPictures = { library: Library; images: PlaceImages; files: Map<string, string | null> };

export const createPhysicsPictures = (library: Library, onLoad: () => void): PhysicsPictures => ({
  library,
  images: createPlaceImages(onLoad),
  files: new Map(),
});

const pictureOf = (pictures: PhysicsPictures, subject: string): HTMLImageElement | null => {
  if (!pictures.files.has(subject)) pictures.files.set(subject, libraryFile(pictures.library, subject, 'rest'));
  const file = pictures.files.get(subject);
  return file ? pictures.images.get(file) : null;
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

// Each item as its library picture stretched over its sprite box; ropes, springs and any picture still loading
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
    if (!image || !box) {
      drawPlain(item);
      continue;
    }
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.angle);
    ctx.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height);
    ctx.restore();
  }
};
