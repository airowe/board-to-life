import { z } from 'zod';

const id = z.string().min(1);
const confidence = z.number().min(0).max(1);
const coord = z.number();
const size = z.number().positive();
const vector = z.object({ x: coord, y: coord });

const rect = { x: coord, y: coord, width: size, height: size };

const item = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('ball'), x: coord, y: coord, radius: size, velocity: vector.optional(), confidence }),
  z.object({ id, kind: z.literal('block'), ...rect, angle: coord.default(0), velocity: vector.optional(), confidence }),
  z.object({ id, kind: z.literal('domino'), ...rect, angle: coord.default(0), velocity: vector.optional(), confidence }),
  z.object({ id, kind: z.literal('lever'), ...rect, angle: coord.default(0), confidence }),
  z.object({ id, kind: z.literal('ramp'), x1: coord, y1: coord, x2: coord, y2: coord, thickness: size, confidence }),
  z.object({ id, kind: z.literal('wall'), ...rect, confidence }),
  z.object({ id, kind: z.literal('floor'), ...rect, confidence }),
  z.object({ id, kind: z.literal('pivot'), x: coord, y: coord, confidence }),
  z.object({ id, kind: z.literal('pulley'), x: coord, y: coord, radius: size, confidence }),
  z.object({ id, kind: z.literal('rope'), from: id, to: id, length: size, confidence }),
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
  items: z.array(item),
  joints: z.array(joint),
  labels: z.array(label),
  unknownMarks: z.array(unknownMark),
  predictPoints: z.array(z.object({ id, trigger })),
});

export type Scene = z.infer<typeof sceneSchema>;
export type SceneItem = Scene['items'][number];
export type BodyKind = SceneItem['kind'];
export type Trigger = Scene['predictPoints'][number]['trigger'];

export const BODY_KINDS = item.options.map((option) => option.shape.kind.value) as readonly BodyKind[];

export type ValidationResult = { ok: true; scene: Scene } | { ok: false; errors: string[] };

const anchorPoints = (entry: SceneItem): { x: number; y: number }[] => {
  switch (entry.kind) {
    case 'ramp':
      return [{ x: entry.x1, y: entry.y1 }, { x: entry.x2, y: entry.y2 }];
    case 'rope':
      return [];
    default:
      return [{ x: entry.x, y: entry.y }];
  }
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
  const requireItem = (ref: string, where: string): void => {
    if (!itemIds.has(ref)) errors.push(`${where} references missing item "${ref}"`);
  };

  const { width, height } = scene.drawing;
  const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;

  for (const entry of scene.items) {
    if (!anchorPoints(entry).every(inside)) errors.push(`item "${entry.id}" is outside the drawing`);
    if (entry.kind === 'rope') {
      requireItem(entry.from, `rope "${entry.id}"`);
      requireItem(entry.to, `rope "${entry.id}"`);
    }
  }
  for (const entry of scene.joints) {
    requireItem(entry.a, `joint "${entry.id}"`);
    requireItem(entry.b, `joint "${entry.id}"`);
  }
  for (const entry of scene.labels) {
    if (entry.attachesTo !== undefined) requireItem(entry.attachesTo, `label "${entry.id}"`);
  }
  for (const point of scene.predictPoints) {
    if (point.trigger.kind === 'contact') {
      requireItem(point.trigger.a, `predict point "${point.id}"`);
      requireItem(point.trigger.b, `predict point "${point.id}"`);
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
