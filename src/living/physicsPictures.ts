import type { BodySnapshot } from '../physics/simulation';
import { isLink, type Body, type Scene, type SceneItem } from '../scene/schema';
import { outlineOf } from '../scene/shapes';
import { FLOOR_Y } from './layout';

// Tunable by eye. A plank picture drawn exactly as thick as a thin ramp reads as a line.
export const PLANK_THICKNESS_FACTOR = 1.5;
// Tunable by eye. A domino's body is thinner than a person, so the figure riding a cart is drawn wider than its body.
export const FIGURE_WIDTH_FACTOR = 2.4;
// A ramp's leg stands this fraction of the way in from its end.
export const LEG_INSET = 0.06;
// In drawing units: an end this close to the table rests on it and needs no leg.
const LEG_MIN_LENGTH = 24;
// In drawing units: how far above the table a thing still casts a shadow on it.
export const CONTACT_SHADOW_REACH = 260;
const SHADOW_DARKEST = 0.34;
const SHADOW_SPREAD = 0.6;
const SHADOW_FLATNESS = 0.14;
const SHADOW_MIN_DEPTH = 3;
// How far off a cart's top, as a fraction of the rider's height, a domino still counts as riding it.
const RIDING_TOLERANCE = 0.3;
// In drawing units, twice the clean drawing's pivot triangle; the fulcrum's tip is the pivot point.
export const FULCRUM_SIZE = { width: 56, height: 48 };
export const PHYSICS_BACKGROUND = 'bg-tabletop';
// Walls are tiled with bricks rather than stretched: one course this tall in drawing units (a domino is about 110).
export const BRICK_COURSE_HEIGHT = 24;
// How far the backdrop's table line may miss the board's floor, in canvas px, before a floor band is drawn instead.
export const FLOOR_TOLERANCE_PX = 4;
// Counted on brick-wall.webp.
export const BRICK_COURSES_IN_PICTURE = 5;

export type SpriteBox = { cx: number; cy: number; width: number; height: number; angle: number };
// floorError: where the background's floor lands minus where the board's floor is, in canvas px (negative: the table line is higher).
export type Placement = { scale: number; offsetX: number; offsetY: number; floorError: number };
export type PhysicsSkin = 'pictures' | 'photo' | 'clean';
export type PictureFit = { mode: 'stretch' | 'contain'; anchor: 'top' | 'centre' | 'bottom' };
// In the box's own frame: relative to its centre, before it is turned.
export type PictureRect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

const STRETCH: PictureFit = { mode: 'stretch', anchor: 'centre' };
const CENTRED: PictureFit = { mode: 'contain', anchor: 'centre' };
// The plank is stretched along its ramp or lever by design, and dominoes and blocks fill their whole body, since
// the class watches whether that body tips, and a cart's body fills its chassis with its wheels drawn apart. Every other
// picture keeps its own shape: a weight hangs from its hook, a fulcrum's tip is the pivot, and a figure stands on its feet.
const FITS: Record<string, PictureFit> = {
  plank: STRETCH,
  domino: STRETCH,
  'wooden-block': STRETCH,
  weight: { mode: 'contain', anchor: 'top' },
  fulcrum: { mode: 'contain', anchor: 'top' },
  cart: STRETCH,
  'peg-figure': { mode: 'contain', anchor: 'bottom' },
};

const SKIN_ORDER: readonly PhysicsSkin[] = ['pictures', 'photo', 'clean'];

const heightOf = (item: SceneItem): number | null => {
  if (isLink(item)) return null;
  return item.kind === 'ramp' ? Math.min(item.y1, item.y2) : item.y;
};

// A ball or block hangs when it is tied to something level with it or higher: the far end, or the pulley the rope runs over.
// Level counts, because a pendulum is drawn pulled out to the side at the height it hangs from.
const hangs = (item: Extract<SceneItem, { kind: 'ball' | 'block' }>, scene: Scene): boolean => {
  const byId = new Map(scene.items.map((each) => [each.id, each]));
  return scene.items.some((link) => {
    if (!isLink(link) || (link.from !== item.id && link.to !== item.id)) return false;
    const anchorId = link.kind === 'rope' && link.over !== undefined ? link.over : link.from === item.id ? link.to : link.from;
    const anchor = byId.get(anchorId);
    const anchorY = anchor ? heightOf(anchor) : null;
    return anchorY !== null && anchorY <= item.y;
  });
};

// Measured in the cart's own frame, so a passenger still counts on a cart drawn tilted on its ramp.
const ridesCart = (rider: Extract<SceneItem, { kind: 'domino' }>, scene: Scene): boolean =>
  scene.items.some((cart) => {
    if (cart.kind !== 'cart') return false;
    const [dx, dy] = [rider.x - cart.x, rider.y - cart.y];
    const [cos, sin] = [Math.cos(cart.angle), Math.sin(cart.angle)];
    const [along, above] = [dx * cos + dy * sin, dx * sin - dy * cos];
    const standsOn = cart.height / 2 + rider.height / 2;
    return Math.abs(along) <= cart.width / 2 && Math.abs(above - standsOn) <= rider.height * RIDING_TOLERANCE;
  });

export const physicsSubject = (item: SceneItem, scene: Scene): string | null => {
  switch (item.kind) {
    case 'ball':
      return hangs(item, scene) ? 'pendulum-bob' : 'steel-ball';
    case 'block':
      return hangs(item, scene) ? 'weight' : 'wooden-block';
    case 'domino':
      return ridesCart(item, scene) ? 'peg-figure' : 'domino';
    case 'ramp':
    case 'lever':
      return 'plank';
    case 'wall':
      return 'brick-wall';
    case 'cart':
      return 'cart';
    case 'pulley':
      return 'pulley';
    case 'pivot':
      return 'fulcrum';
    case 'floor':
    case 'rope':
    case 'spring':
      return null;
  }
};

export const spriteBox = (item: SceneItem, body: BodySnapshot | undefined): SpriteBox | null => {
  switch (item.kind) {
    case 'ramp': {
      const [dx, dy] = [item.x2 - item.x1, item.y2 - item.y1];
      return {
        cx: (item.x1 + item.x2) / 2,
        cy: (item.y1 + item.y2) / 2,
        width: Math.hypot(dx, dy),
        height: item.thickness * PLANK_THICKNESS_FACTOR,
        angle: Math.atan2(dy, dx),
      };
    }
    case 'pivot':
      return { cx: item.x, cy: item.y + FULCRUM_SIZE.height / 2, width: FULCRUM_SIZE.width, height: FULCRUM_SIZE.height, angle: 0 };
    case 'pulley':
      return { cx: item.x, cy: item.y, width: item.radius * 2, height: item.radius * 2, angle: 0 };
    case 'rope':
    case 'spring':
      return null;
    default:
      break;
  }
  if (!body) return null;
  if (item.kind === 'ball') return { cx: body.x, cy: body.y, width: item.radius * 2, height: item.radius * 2, angle: body.angle };
  const height = item.kind === 'lever' ? item.height * PLANK_THICKNESS_FACTOR : item.height;
  return { cx: body.x, cy: body.y, width: item.width, height, angle: body.angle };
};

export const figureBox = (box: SpriteBox): SpriteBox => ({ ...box, width: box.width * FIGURE_WIDTH_FACTOR });

// The planks a ramp stands on, reaching down to the table: the high end always, the low end when it is raised too.
export const rampSupports = (ramp: Extract<SceneItem, { kind: 'ramp' }>, floorY: number): SpriteBox[] => {
  const [high, low] = ramp.y1 <= ramp.y2 ? [{ x: ramp.x1, y: ramp.y1 }, { x: ramp.x2, y: ramp.y2 }] : [{ x: ramp.x2, y: ramp.y2 }, { x: ramp.x1, y: ramp.y1 }];
  const legAt = (end: { x: number; y: number }, other: { x: number; y: number }): SpriteBox[] => {
    if (floorY - end.y < LEG_MIN_LENGTH) return [];
    const [x, y] = [end.x + LEG_INSET * (other.x - end.x), end.y + LEG_INSET * (other.y - end.y)];
    const length = floorY - y;
    return [{ cx: x, cy: (y + floorY) / 2, width: length, height: ramp.thickness * PLANK_THICKNESS_FACTOR, angle: Math.PI / 2 }];
  };
  return [...legAt(high, low), ...legAt(low, high)];
};

export type ContactShadow = { cx: number; cy: number; rx: number; ry: number; alpha: number };

// The soft shadow a thing casts straight down on the table: tight and dark on it, wider and fainter as it rises.
export const contactShadow = (box: SpriteBox, floorY: number): ContactShadow | null => {
  const [cos, sin] = [Math.abs(Math.cos(box.angle)), Math.abs(Math.sin(box.angle))];
  const halfAcross = (box.width * cos + box.height * sin) / 2;
  const halfDown = (box.width * sin + box.height * cos) / 2;
  const gap = Math.max(0, floorY - (box.cy + halfDown));
  if (gap > CONTACT_SHADOW_REACH) return null;
  const height = gap / CONTACT_SHADOW_REACH;
  const rx = halfAcross * (1 + SHADOW_SPREAD * height);
  return { cx: box.cx, cy: floorY, rx, ry: Math.max(SHADOW_MIN_DEPTH, rx * SHADOW_FLATNESS), alpha: SHADOW_DARKEST * (1 - height) };
};

// How far a cart's wheels have turned, in radians, rolling without slipping from where the cart was drawn.
export const wheelTurn = (cart: Extract<SceneItem, { kind: 'cart' }>, body: BodySnapshot): number => (body.x - cart.x) / cart.wheelRadius;

export const pictureFit = (subject: string): PictureFit => FITS[subject] ?? CENTRED;

export const pictureRect = (box: SpriteBox, picture: Size, fit: PictureFit): PictureRect => {
  const [halfWidth, halfHeight] = [box.width / 2, box.height / 2];
  if (fit.mode === 'stretch') return { x: -halfWidth, y: -halfHeight, width: box.width, height: box.height };
  const scale = Math.min(box.width / picture.width, box.height / picture.height);
  const [width, height] = [picture.width * scale, picture.height * scale];
  const y = fit.anchor === 'top' ? -halfHeight : fit.anchor === 'bottom' ? halfHeight - height : -height / 2;
  return { x: -width / 2, y, width, height };
};

// One tile of the brick pattern in drawing units, the same for every wall so the bricks match across walls.
export const brickTileSize = (picture: Size): Size => {
  const height = BRICK_COURSE_HEIGHT * BRICK_COURSES_IN_PICTURE;
  return { width: (picture.width * height) / picture.height, height };
};

// Every background shares one floor line, at the same fraction of its height.
export const backgroundFloor = (size: Size): Size & { floorY: number } => ({ ...size, floorY: FLOOR_Y * size.height });

// The background covers the canvas, centred across, and slid up or down so its floor meets the board's floor
// as nearly as it can without uncovering an edge.
export const backgroundPlacement = (canvas: Size, background: Size & { floorY: number }, boardFloorOnCanvas: number): Placement => {
  const scale = Math.max(canvas.width / background.width, canvas.height / background.height);
  const lowest = canvas.height - background.height * scale;
  const wanted = boardFloorOnCanvas - background.floorY * scale;
  const offsetY = Math.min(0, Math.max(lowest, wanted));
  return { scale, offsetX: (canvas.width - background.width * scale) / 2, offsetY, floorError: offsetY - wanted };
};

// When the cover cannot bring the table line to the board's floor, pieces would float above it or sink into it.
export const needsFloorBand = (placement: Placement): boolean => Math.abs(placement.floorError) > FLOOR_TOLERANCE_PX;

const bottomOf = (body: Body): number | null => {
  if (body.kind === 'pivot') return body.y;
  const outline = outlineOf(body);
  return outline ? Math.max(...outline.map((point) => point.y)) : null;
};

export const boardFloorY = (scene: Scene): number => {
  const floors = scene.items.flatMap((item) => (item.kind === 'floor' ? [item.y - item.height / 2] : []));
  if (floors.length > 0) return Math.max(...floors);
  const bottoms = scene.items.flatMap((item) => {
    if (isLink(item)) return [];
    const bottom = bottomOf(item);
    return bottom === null ? [] : [bottom];
  });
  return bottoms.length > 0 ? Math.max(...bottoms) : scene.drawing.height;
};

export const initialSkin = (libraryLoaded: boolean, hasPhoto = false): PhysicsSkin => {
  if (libraryLoaded) return 'pictures';
  return hasPhoto ? 'photo' : 'clean';
};

// Pictures, then the photo (when there is one), then the clean drawing, and round again.
export const nextSkin = (skin: PhysicsSkin, hasPhoto: boolean, hasPictures = true): PhysicsSkin => {
  const available = SKIN_ORDER.filter((each) => (each === 'photo' ? hasPhoto : each === 'pictures' ? hasPictures : true));
  const from = SKIN_ORDER.indexOf(skin);
  for (let step = 1; step <= SKIN_ORDER.length; step += 1) {
    const candidate = SKIN_ORDER[(from + step) % SKIN_ORDER.length] as PhysicsSkin;
    if (available.includes(candidate)) return candidate;
  }
  return skin;
};
