import type { BodySnapshot } from '../physics/simulation';
import type { Library } from '../library/manifest';
import { libraryFile } from '../library/match';
import {
  backgroundFloor,
  backgroundPlacement,
  boardFloorY,
  brickTileSize,
  contactShadow,
  figureBox,
  MOUNT,
  mountFrame,
  needsFloorBand,
  physicsSubject,
  PHYSICS_BACKGROUND,
  pictureFit,
  pictureRect,
  rampSupports,
  shelfSupports,
  springCoil,
  spriteBox,
  wheelTurn,
  type ContactShadow,
  type PhysicsSkin,
  type SpriteBox,
} from '../living/physicsPictures';
import type { Point, View } from '../present/view';
import { cartWheels } from '../scene/cart';
import { linkPoints } from '../scene/linkPoints';
import { isLink, type Scene, type SceneItem } from '../scene/schema';
import { createPlaceImages, type PlaceImages } from './placeView';

// Tunable by eye: ropes drawn as twine and springs as steel over the pictures.
export const ROPE_INK = '#8a6236';
export const SPRING_INK = '#4d5660';
const SPRING_SHINE = '#d7dee5';
const SPRING_WIDTH = 6;
const ROPE_TWIST = '#c9a877';
const ROPE_WIDTH = 6;
const ROPE_TWIST_DASH = [5, 6];
// The floor band drawn when the backdrop's own table line cannot reach the board's floor: a wooden tabletop.
export const TABLE_WOOD = '#b07a45';
export const TABLE_EDGE = '#7a4f2a';
const TABLE_EDGE_PX = 4;
// Shown on the skin button: it names the skin a press switches to.
export const SKIN_LABELS: Record<PhysicsSkin, string> = {
  pictures: 'Show the pictures',
  photo: 'Show it on the photo',
  clean: 'Show the clean drawing',
};

// Fixed things sit at the back, ropes run over them, and what moves is drawn on top, covering the rope ends.
const MOVING_KINDS: readonly SceneItem['kind'][] = ['ball', 'block', 'domino', 'cart', 'lever'];
const layerOf = (item: SceneItem): number => (isLink(item) ? 1 : MOVING_KINDS.includes(item.kind) ? 2 : 0);

// What a scene needs on every frame, worked out once per scene the playback runs.
type Framed = { scene: Scene; ordered: SceneItem[]; floorY: number };
// Subjects are judged once on the scene as approved, so dragging a piece never swaps its picture.
// Patterns belong to the canvas they were made on; the presenter draws on a single canvas.
export type PhysicsPictures = {
  library: Library;
  images: PlaceImages;
  files: Map<string, string | null>;
  subjects: Map<string, string | null>;
  bricks: CanvasPattern | null;
  framed: Framed | null;
};

export const createPhysicsPictures = (library: Library, approved: Scene, onLoad: () => void): PhysicsPictures => ({
  library,
  images: createPlaceImages(onLoad),
  files: new Map(),
  subjects: new Map(approved.items.map((item) => [item.id, physicsSubject(item, approved)])),
  bricks: null,
  framed: null,
});

const framedFor = (pictures: PhysicsPictures, scene: Scene): Framed => {
  if (pictures.framed?.scene !== scene) {
    pictures.framed = { scene, ordered: [...scene.items].sort((a, b) => layerOf(a) - layerOf(b)), floorY: boardFloorY(scene) };
  }
  return pictures.framed;
};

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

const drawShadow = (ctx: CanvasRenderingContext2D, { cx, cy, rx, ry, alpha }: ContactShadow): void => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0, `rgba(40, 24, 10, ${alpha})`);
  fade.addColorStop(1, 'rgba(40, 24, 10, 0)');
  ctx.fillStyle = fade;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const supportsOf = (item: SceneItem, scene: Scene, floorY: number): SpriteBox[] => {
  if (item.kind === 'ramp') return rampSupports(item, floorY);
  if (item.kind === 'wall') return shelfSupports(item, floorY);
  return item.kind === 'pivot' || item.kind === 'pulley' ? mountFrame(item, scene, floorY) : [];
};

const tracePath = (ctx: CanvasRenderingContext2D, points: Point[]): void => {
  ctx.beginPath();
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
};

// Twine: a dark core with a lighter twist laid over it.
const drawRope = (ctx: CanvasRenderingContext2D, points: Point[]): void => {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  tracePath(ctx, points);
  ctx.strokeStyle = ROPE_INK;
  ctx.lineWidth = ROPE_WIDTH;
  ctx.stroke();
  ctx.strokeStyle = ROPE_TWIST;
  ctx.lineWidth = ROPE_WIDTH / 2;
  ctx.setLineDash(ROPE_TWIST_DASH);
  ctx.stroke();
  ctx.restore();
};

// Steel wire: a dark edge with a bright highlight along it.
const drawSpring = (ctx: CanvasRenderingContext2D, points: Point[]): void => {
  const [first, last] = [points[0], points.at(-1)];
  if (!first || !last) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  tracePath(ctx, springCoil(first, last));
  ctx.strokeStyle = SPRING_INK;
  ctx.lineWidth = SPRING_WIDTH;
  ctx.stroke();
  ctx.strokeStyle = SPRING_SHINE;
  ctx.lineWidth = SPRING_WIDTH / 3;
  ctx.stroke();
  ctx.restore();
};

const drawWheels = (ctx: CanvasRenderingContext2D, pictures: PhysicsPictures, cart: Extract<SceneItem, { kind: 'cart' }>, body: BodySnapshot | undefined): void => {
  const image = pictureOf(pictures, 'cart-wheel');
  if (!image || !body) return;
  const size = cart.wheelRadius * 2;
  for (const wheel of cartWheels({ ...cart, x: body.x, y: body.y, angle: body.angle })) {
    drawPicture(ctx, pictures, 'cart-wheel', image, { cx: wheel.x, cy: wheel.y, width: size, height: size, angle: wheelTurn(cart, body) });
  }
};

const drawFloorBand = (ctx: CanvasRenderingContext2D, screen: { width: number; height: number }, floorOnCanvas: number): void => {
  ctx.save();
  ctx.fillStyle = TABLE_WOOD;
  ctx.fillRect(0, floorOnCanvas, screen.width, screen.height - floorOnCanvas);
  ctx.fillStyle = TABLE_EDGE;
  ctx.fillRect(0, floorOnCanvas, screen.width, TABLE_EDGE_PX);
  ctx.restore();
};

// The tabletop behind everything, in canvas (CSS) pixels, with its floor laid on the board's floor where it can be;
// where it cannot, a wooden band is laid along the board's floor so nothing floats or sinks.
// True once the floor is covered this way; false until the picture has loaded.
export const drawBackdrop = (ctx: CanvasRenderingContext2D, pictures: PhysicsPictures, screen: { width: number; height: number }, view: View, scene: Scene): boolean => {
  const image = pictureOf(pictures, PHYSICS_BACKGROUND);
  if (!image) return false;
  const background = backgroundFloor({ width: image.naturalWidth, height: image.naturalHeight });
  const floorOnCanvas = view.offsetY + framedFor(pictures, scene).floorY * view.scale;
  const placement = backgroundPlacement(screen, background, floorOnCanvas);
  ctx.drawImage(image, placement.offsetX, placement.offsetY, background.width * placement.scale, background.height * placement.scale);
  if (needsFloorBand(placement)) drawFloorBand(ctx, screen, floorOnCanvas);
  return true;
};

// Each item as its library picture fitted to its sprite box (walls as bricks); ropes, springs and any picture still loading
// fall back to the clean drawing. The backdrop covers the floor once it has loaded.
export const drawPictureItems = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  bodies: Map<string, BodySnapshot>,
  pictures: PhysicsPictures,
  backdrop: boolean,
  drawPlain: (item: SceneItem, ink?: string) => void,
): void => {
  const { ordered, floorY } = framedFor(pictures, scene);
  const plank = pictureOf(pictures, 'plank');
  if (plank) for (const item of ordered) for (const part of supportsOf(item, scene, floorY)) drawPicture(ctx, pictures, 'plank', plank, part);
  for (const item of ordered) {
    const box = item.kind === 'ramp' || item.kind === 'pulley' || item.kind === 'floor' ? null : spriteBox(item, bodies.get(item.id));
    const shadow = box ? contactShadow(box, floorY) : null;
    if (shadow) drawShadow(ctx, shadow);
  }
  for (const item of ordered) {
    if (item.kind === 'rope' || item.kind === 'spring') {
      const points = linkPoints(item, (id) => bodies.get(id) ?? null);
      if (points.length > 0) (item.kind === 'rope' ? drawRope : drawSpring)(ctx, points);
      continue;
    }
    if (item.kind === 'floor' && backdrop) continue;
    const subject = pictures.subjects.get(item.id) ?? null;
    if (subject === MOUNT) continue;
    const image = subject ? pictureOf(pictures, subject) : null;
    const box = spriteBox(item, bodies.get(item.id));
    if (!subject || !image || !box) drawPlain(item);
    else {
      if (item.kind === 'cart') drawWheels(ctx, pictures, item, bodies.get(item.id));
      drawPicture(ctx, pictures, subject, image, subject === 'peg-figure' ? figureBox(box) : box);
    }
  }
};
