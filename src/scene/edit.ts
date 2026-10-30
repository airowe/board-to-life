import { isLink, validateScene, type Body, type BodyKind, type Scene } from './schema';
import { distanceTo, outlineOf, penetration, type Point } from './shapes';

// Students change the setup between runs by dragging pieces: whole bodies by their middle, ramps by either end.
export type Grip = { id: string; part: 'body' | 'start' | 'end' };
export type EditResult = { ok: true; scene: Scene } | { ok: false; reason: string };

const DRAGGABLE: readonly BodyKind[] = ['ball', 'block', 'domino', 'lever', 'cart', 'wall'];
const DYNAMIC: readonly BodyKind[] = ['ball', 'block', 'domino', 'lever', 'cart'];
// Drawing units. Hand-drawn pieces often overlap a little already; a move may not make that worse by more than this.
const OVERLAP_TOLERANCE = 1;
// A piece dropped into the floor or onto a ramp is lifted until it rests on top, but only this far.
const MAX_LIFT = 60;
const LIFT_TRIES = 12;
const ROPE_TOLERANCE = 1;

const bodiesOf = (scene: Scene): Body[] => scene.items.filter((item): item is Body => !isLink(item));
const bodyIn = (scene: Scene, id: string): Body | undefined => bodiesOf(scene).find((item) => item.id === id);
const centreOf = (body: Body): Point => (body.kind === 'ramp' ? { x: (body.x1 + body.x2) / 2, y: (body.y1 + body.y2) / 2 } : { x: body.x, y: body.y });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const area = (polygon: Point[]): number =>
  Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? point;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;

export const rampHandles = (scene: Scene): { grip: Grip; x: number; y: number }[] =>
  bodiesOf(scene).flatMap((body) =>
    body.kind === 'ramp'
      ? [
          { grip: { id: body.id, part: 'start' as const }, x: body.x1, y: body.y1 },
          { grip: { id: body.id, part: 'end' as const }, x: body.x2, y: body.y2 },
        ]
      : [],
  );

// The point that follows the pointer while a grip is held: a ramp's end, or a body's middle.
export const gripPoint = (scene: Scene, grip: Grip): Point | null => {
  const body = bodyIn(scene, grip.id);
  if (!body) return null;
  if (body.kind !== 'ramp' || grip.part === 'body') return centreOf(body);
  return grip.part === 'start' ? { x: body.x1, y: body.y1 } : { x: body.x2, y: body.y2 };
};

// The piece under a finger or pointer, allowing `reach` drawing units of slack; the nearest, then the smallest, wins.
export const pickGrip = (scene: Scene, point: Point, reach: number): Grip | null => {
  const ends = rampHandles(scene).map(({ grip, x, y }) => ({ grip, gap: distance(point, { x, y }), size: 0 }));
  const bodies = bodiesOf(scene).flatMap((body) => {
    const outline = DRAGGABLE.includes(body.kind) ? outlineOf(body) : null;
    return outline ? [{ grip: { id: body.id, part: 'body' as const }, gap: distanceTo(outline, point), size: area(outline) }] : [];
  });
  const [best] = [...ends, ...bodies].filter(({ gap }) => gap <= reach).sort((a, b) => a.gap - b.gap || a.size - b.size);
  return best?.grip ?? null;
};

const shifted = (body: Body, dx: number, dy: number): Body =>
  body.kind === 'ramp' ? { ...body, x1: body.x1 + dx, y1: body.y1 + dy, x2: body.x2 + dx, y2: body.y2 + dy } : { ...body, x: body.x + dx, y: body.y + dy };

const withBody = (scene: Scene, body: Body): Scene => ({ ...scene, items: scene.items.map((item) => (item.id === body.id ? body : item)) });

const depth = (a: Body, b: Body): number => {
  const [outlineA, outlineB] = [outlineOf(a), outlineOf(b)];
  return outlineA && outlineB ? penetration(outlineA, outlineB) : 0;
};

type Clash = { with: string; excess: number };

// The first body that `id` now digs into further than it did in the drawing. Two fixed things may overlap freely.
const clashFor = (scene: Scene, original: Scene, id: string): Clash | null => {
  const moved = bodyIn(scene, id);
  const before = bodyIn(original, id);
  if (!moved || !before) return null;
  for (const other of bodiesOf(scene)) {
    if (other.id === id || (!DYNAMIC.includes(moved.kind) && !DYNAMIC.includes(other.kind))) continue;
    const otherBefore = bodyIn(original, other.id) ?? other;
    const excess = depth(moved, other) - depth(before, otherBefore) - OVERLAP_TOLERANCE;
    if (excess > 0) return { with: other.id, excess };
  }
  return null;
};

// Raises `id` until it stops digging into anything, as if set down on top of what is below it.
const settle = (scene: Scene, original: Scene, id: string): { ok: true; scene: Scene } | { ok: false; blocker: string } => {
  const first = clashFor(scene, original, id);
  if (!first) return { ok: true, scene };
  let current = scene;
  let lift = 0;
  for (let attempt = 0; attempt < LIFT_TRIES; attempt += 1) {
    const clash = clashFor(current, original, id);
    if (!clash) return { ok: true, scene: current };
    const step = clash.excess + OVERLAP_TOLERANCE / 2;
    lift += step;
    const body = bodyIn(current, id);
    if (lift > MAX_LIFT || !body) break;
    current = withBody(current, shifted(body, 0, -step));
  }
  return { ok: false, blocker: first.with };
};

const ropeUse = (scene: Scene, rope: Extract<Scene['items'][number], { kind: 'rope' }>): number => {
  const at = (id: string): Point => {
    const body = bodyIn(scene, id);
    return body ? centreOf(body) : { x: 0, y: 0 };
  };
  return rope.over === undefined ? distance(at(rope.from), at(rope.to)) : distance(at(rope.from), at(rope.over)) + distance(at(rope.over), at(rope.to));
};

const ropes = (scene: Scene) => scene.items.filter((item) => item.kind === 'rope');

// A rope can be slack but never longer than it is, so a roped piece follows the pointer only as far as the rope lets it.
const withinRopes = (scene: Scene, id: string, target: Point): Point =>
  ropes(scene).reduce((point, rope) => {
    if (rope.from !== id && rope.to !== id) return point;
    const other = bodyIn(scene, rope.from === id ? rope.to : rope.from);
    const wheel = rope.over === undefined ? undefined : bodyIn(scene, rope.over);
    if (!other) return point;
    const anchor = centreOf(wheel ?? other);
    const reach = rope.length - (wheel ? distance(centreOf(other), anchor) : 0);
    const gap = distance(point, anchor);
    if (reach <= 0 || gap <= reach) return point;
    return { x: anchor.x + ((point.x - anchor.x) * reach) / gap, y: anchor.y + ((point.y - anchor.y) * reach) / gap };
  }, target);

const overstretched = (scene: Scene, original: Scene): boolean =>
  ropes(scene).some((rope) => {
    const drawn = ropes(original).find((each) => each.id === rope.id);
    const allowed = Math.max(rope.length, drawn ? ropeUse(original, drawn) : 0) + ROPE_TOLERANCE;
    return ropeUse(scene, rope) > allowed;
  });

// Written labels such as "5 kg" travel with the piece they belong to.
const carryLabels = (scene: Scene, original: Scene): Scene => ({
  ...scene,
  labels: scene.labels.map((label) => {
    const [now, then] = label.attachesTo ? [bodyIn(scene, label.attachesTo), bodyIn(original, label.attachesTo)] : [undefined, undefined];
    if (!now || !then || now.kind === 'ramp' || then.kind === 'ramp') return label;
    return { ...label, x: label.x + now.x - then.x, y: label.y + now.y - then.y };
  }),
});

const placeRampEnd = (scene: Scene, ramp: Extract<Body, { kind: 'ramp' }>, part: Grip['part'], to: Point): EditResult => {
  const moved = part === 'start' ? { ...ramp, x1: to.x, y1: to.y } : { ...ramp, x2: to.x, y2: to.y };
  let current = withBody(scene, moved);
  // A piece resting on the ramp is carried up with it; anything else in the way stops the move.
  for (let attempt = 0; attempt < bodiesOf(scene).length; attempt += 1) {
    const clash = clashFor(current, scene, ramp.id);
    if (!clash) return { ok: true, scene: current };
    const [resting, rampBefore] = [bodyIn(scene, clash.with), bodyIn(scene, ramp.id)];
    if (!resting || !rampBefore || depth(resting, rampBefore) <= 0) return { ok: false, reason: `That spot is taken by ${clash.with}.` };
    const settled = settle(current, scene, clash.with);
    if (!settled.ok) return { ok: false, reason: `That spot is taken by ${clash.with}.` };
    current = settled.scene;
  }
  return { ok: false, reason: 'That spot is too crowded.' };
};

const placeBody = (scene: Scene, body: Body, to: Point): EditResult => {
  const target = withinRopes(scene, body.id, to);
  const { x, y } = centreOf(body);
  const settled = settle(withBody(scene, shifted(body, target.x - x, target.y - y)), scene, body.id);
  return settled.ok ? { ok: true, scene: settled.scene } : { ok: false, reason: `That spot is taken by ${settled.blocker}.` };
};

// Moves the gripped piece so the grip lands on `to`, or says why it cannot go there. The result always passes validateScene.
export const moveGrip = (scene: Scene, grip: Grip, to: Point): EditResult => {
  const body = bodyIn(scene, grip.id);
  if (!body) return { ok: false, reason: 'There is nothing there to move.' };
  if (scene.joints.some((joint) => joint.a === body.id || joint.b === body.id)) return { ok: false, reason: `${body.id} is pinned in place.` };
  const inside = { x: Math.min(scene.drawing.width, Math.max(0, to.x)), y: Math.min(scene.drawing.height, Math.max(0, to.y)) };
  const placed =
    body.kind === 'ramp' && grip.part !== 'body'
      ? placeRampEnd(scene, body, grip.part, inside)
      : DRAGGABLE.includes(body.kind) && grip.part === 'body'
        ? placeBody(scene, body, inside)
        : { ok: false as const, reason: `${body.id} stays where it was drawn.` };
  if (!placed.ok) return placed;
  if (overstretched(placed.scene, scene)) return { ok: false, reason: 'The rope is not long enough to reach there.' };
  const checked = validateScene(carryLabels(placed.scene, scene));
  return checked.ok ? { ok: true, scene: checked.scene } : { ok: false, reason: 'That would put a piece off the board.' };
};

// Fixed items the student moved. Their ink stays on the photo, so it must be painted out and the item drawn afresh.
export const changedFixedItems = (original: Scene, edited: Scene): string[] =>
  bodiesOf(edited)
    .filter((body) => !DYNAMIC.includes(body.kind))
    .filter((body) => JSON.stringify(body) !== JSON.stringify(bodyIn(original, body.id)))
    .map((body) => body.id);
