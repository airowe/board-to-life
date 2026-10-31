import { z } from 'zod';

// Long enough for every check drawing to come to rest; a predict point later than this is never reached.
export const SETTLE_SECONDS = 7;
export const MAX_SCENE_ENTRIES = 200;

const id = z.string().min(1);
const listOf = <T extends z.ZodType>(name: string, entry: T) =>
  z.array(entry).max(MAX_SCENE_ENTRIES, `at most ${MAX_SCENE_ENTRIES} ${name} are allowed`);
const confidence = z.number().min(0).max(1);
const coord = z.number();
const size = z.number().positive();
const vector = z.object({ x: coord, y: coord });

const rect = { x: coord, y: coord, width: size, height: size };
// In kilograms, when the teacher writes one next to the item; otherwise it comes from the item's size.
const mass = size.optional();

const item = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('ball'), x: coord, y: coord, radius: size, velocity: vector.optional(), mass, confidence }),
  z.object({ id, kind: z.literal('block'), ...rect, angle: coord.default(0), velocity: vector.optional(), mass, confidence }),
  z.object({ id, kind: z.literal('domino'), ...rect, angle: coord.default(0), velocity: vector.optional(), mass, confidence }),
  z.object({ id, kind: z.literal('lever'), ...rect, angle: coord.default(0), mass, confidence }),
  // x, y and the rectangle are the cart's body; a wheel sits on each bottom corner.
  z.object({ id, kind: z.literal('cart'), ...rect, wheelRadius: size, angle: coord.default(0), velocity: vector.optional(), mass, confidence }),
  z.object({ id, kind: z.literal('ramp'), x1: coord, y1: coord, x2: coord, y2: coord, thickness: size, confidence }),
  z.object({ id, kind: z.literal('wall'), ...rect, confidence }),
  z.object({ id, kind: z.literal('floor'), ...rect, confidence }),
  z.object({ id, kind: z.literal('pivot'), x: coord, y: coord, confidence }),
  z.object({ id, kind: z.literal('pulley'), x: coord, y: coord, radius: size, confidence }),
  z.object({ id, kind: z.literal('rope'), from: id, to: id, over: id.optional(), length: size, confidence }),
  z.object({ id, kind: z.literal('spring'), from: id, to: id, length: size, confidence }),
]);

const joint = z.object({ id, kind: z.literal('pin'), a: id, b: id, x: coord, y: coord });

const label = z.object({ id, text: z.string().min(1), x: coord, y: coord, attachesTo: id.optional(), confidence });

const unknownMark = z.object({ id, ...rect, note: z.string().min(1), confidence });

const trigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), seconds: z.number().nonnegative() }),
  z.object({ kind: z.literal('contact'), a: id, b: id }),
]);

const sceneSchema = z.object({
  version: z.literal(1),
  drawing: z.object({ width: size, height: size }),
  items: listOf('items', item),
  joints: listOf('joints', joint),
  labels: listOf('labels', label),
  unknownMarks: listOf('unknownMarks', unknownMark),
  predictPoints: listOf('predictPoints', z.object({ id, trigger })),
});

export type Scene = z.infer<typeof sceneSchema>;
export type SceneItem = Scene['items'][number];
export type BodyKind = SceneItem['kind'];
export type Trigger = Scene['predictPoints'][number]['trigger'];

export const BODY_KINDS = item.options.map((option) => option.shape.kind.value) as readonly BodyKind[];

// Ropes and springs join two bodies rather than being bodies themselves.
export type Link = Extract<SceneItem, { kind: 'rope' | 'spring' }>;
export type Body = Exclude<SceneItem, Link>;
export const LINK_KINDS: readonly BodyKind[] = ['rope', 'spring'];
export const isLink = (entry: SceneItem): entry is Link => LINK_KINDS.includes(entry.kind);

export type ValidationResult = { ok: true; scene: Scene } | { ok: false; errors: string[] };

const anchorPoints = (entry: SceneItem): { x: number; y: number }[] => {
  if (isLink(entry)) return [];
  return entry.kind === 'ramp' ? [{ x: entry.x1, y: entry.y1 }, { x: entry.x2, y: entry.y2 }] : [{ x: entry.x, y: entry.y }];
};

const crossReferenceErrors = (scene: Scene): string[] => {
  const errors: string[] = [];
  const seen = new Set<string>();
  const allIds = [
    ...scene.items.map((entry) => entry.id),
    ...scene.joints.map((entry) => entry.id),
    ...scene.labels.map((entry) => entry.id),
    ...scene.unknownMarks.map((entry) => entry.id),
    ...scene.predictPoints.map((entry) => entry.id),
  ];
  for (const each of allIds) {
    if (seen.has(each)) errors.push(`duplicate id "${each}"`);
    seen.add(each);
  }

  const itemIds = new Set(scene.items.map((entry) => entry.id));
  const links = new Map(scene.items.filter(isLink).map((entry) => [entry.id, entry.kind]));
  const requireItem = (ref: string, where: string): void => {
    if (!itemIds.has(ref)) errors.push(`${where} references missing item "${ref}"`);
  };
  const requireBody = (ref: string, where: string): void => {
    const link = links.get(ref);
    if (link) errors.push(`${where}: "${ref}" is a ${link}, not a body`);
    else requireItem(ref, where);
  };

  const { width, height } = scene.drawing;
  const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;

  for (const entry of scene.items) {
    if (!anchorPoints(entry).every(inside)) errors.push(`item "${entry.id}" is outside the drawing`);
    if (isLink(entry)) {
      requireBody(entry.from, `${entry.kind} "${entry.id}"`);
      requireBody(entry.to, `${entry.kind} "${entry.id}"`);
    }
    if (entry.kind === 'rope' && entry.over !== undefined) {
      const wheel = scene.items.find((other) => other.id === entry.over);
      if (!wheel) requireItem(entry.over, `rope "${entry.id}"`);
      else if (wheel.kind !== 'pulley') errors.push(`rope "${entry.id}" runs over "${entry.over}", which is not a pulley`);
    }
  }
  for (const entry of scene.joints) {
    requireBody(entry.a, `joint "${entry.id}"`);
    requireBody(entry.b, `joint "${entry.id}"`);
  }
  for (const entry of scene.labels) {
    if (entry.attachesTo !== undefined) requireItem(entry.attachesTo, `label "${entry.id}"`);
  }
  for (const point of scene.predictPoints) {
    if (point.trigger.kind === 'time' && point.trigger.seconds >= SETTLE_SECONDS) {
      errors.push(`predict point "${point.id}" triggers at ${point.trigger.seconds} s, after the run ends at ${SETTLE_SECONDS} s`);
    }
    if (point.trigger.kind === 'contact') {
      requireBody(point.trigger.a, `predict point "${point.id}"`);
      requireBody(point.trigger.b, `predict point "${point.id}"`);
    }
  }
  return errors;
};

export const validateScene = (input: unknown): ValidationResult => {
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const errors = crossReferenceErrors(parsed.data);
  return errors.length === 0 ? { ok: true, scene: parsed.data } : { ok: false, errors };
};
