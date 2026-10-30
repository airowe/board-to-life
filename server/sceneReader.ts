import { BODY_KINDS } from '../src/scene/schema';
import type { ImageSize } from './imageSize';

// The model reports positions on a 0-1000 grid over the photo it was sent.
const GRID = 1000;
// Scenes are this many units on their long edge whatever the photo's resolution, the
// scale the physics is tuned at, so the same drawing plays the same from any camera.
const DRAWING_LONG_EDGE = 1200;
const RAMP_THICKNESS = 16;
// A floor is drawn as a line: the line is the top of the ground, which gets this thickness below it.
export const FLOOR_THICKNESS = 60;
// A push arrow becomes a starting speed in proportion to its drawn length: the
// sample's 80-unit arrow gives 180 units per second.
export const ARROW_TO_SPEED = 2.25;

export type Provider = { name: 'meta' | 'baseten'; baseUrl: string; model: string; keyVariable: string };
export type ProviderWithKey = Provider & { apiKey: string };
export type ProviderName = Provider['name'];

export const PROVIDERS: Record<ProviderName, Provider> = {
  meta: { name: 'meta', baseUrl: 'https://api.meta.ai/v1', model: 'muse-spark-1.3', keyVariable: 'MODEL_API_KEY' },
  baseten: { name: 'baseten', baseUrl: 'https://inference.baseten.co/v1', model: 'meta-models/muse-spark-open', keyVariable: 'BASETEN_API_KEY' },
};

// Standard-mode prices per million tokens, from each provider's pricing page (Oct 2026).
const PRICES: Record<ProviderName, { input: number; cachedInput: number; output: number }> = {
  meta: { input: 1.25, cachedInput: 0.15, output: 4.25 },
  baseten: { input: 1.25, cachedInput: 0.15, output: 4.25 },
};

export type Usage = { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };

export const costOf = (name: ProviderName, usage: Usage | null): number => {
  if (!usage) return 0;
  const price = PRICES[name];
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return ((usage.prompt_tokens - cached) * price.input + cached * price.cachedInput + usage.completion_tokens * price.output) / 1_000_000;
};

export const isProviderName = (name: string): name is ProviderName => name in PROVIDERS;

export const providerFromEnv = (name: ProviderName, env: Record<string, string | undefined>): ProviderWithKey => {
  const provider = PROVIDERS[name];
  const apiKey = env[provider.keyVariable];
  if (!apiKey) throw new Error(`Set ${provider.keyVariable} in .env or .env.local to use the ${name} reader.`);
  return { ...provider, apiKey };
};

type Push = { dx: number; dy: number };
type ModelItem = {
  id: string;
  kind: string;
  confidence: number;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  radius?: number;
  angleDegrees?: number;
  push?: Push;
  from?: string;
  to?: string;
  over?: string;
};

export type ModelScene = {
  lineWidth?: number;
  items: ModelItem[];
  joints: { id: string; a: string; b: string; x: number; y: number }[];
  labels: { id: string; text: string; x: number; y: number; attachesTo?: string; confidence: number }[];
  unknownMarks: { id: string; x: number; y: number; width: number; height: number; note: string; confidence: number }[];
  predictPoints: { id: string; a: string; b: string }[];
};

const number = { type: 'number' };
// Bounded strings: an id is short and plain, and no text field may run on.
const text = { type: 'string', maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' };
const prose = { type: 'string', maxLength: 120 };
const confidence = { type: 'number', minimum: 0, maximum: 1 };
const objectOf = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const MODEL_SCENE_SCHEMA = objectOf(
  {
    lineWidth: number,
    items: {
      type: 'array',
      items: objectOf(
        {
          id: text,
          kind: { type: 'string', enum: BODY_KINDS },
          x: number,
          y: number,
          x2: number,
          y2: number,
          width: number,
          height: number,
          radius: number,
          angleDegrees: number,
          push: objectOf({ dx: number, dy: number }, ['dx', 'dy']),
          from: text,
          to: text,
          over: text,
          confidence,
        },
        ['id', 'kind', 'confidence'],
      ),
    },
    joints: { type: 'array', items: objectOf({ id: text, a: text, b: text, x: number, y: number }, ['id', 'a', 'b', 'x', 'y']) },
    labels: {
      type: 'array',
      items: objectOf({ id: text, text: prose, x: number, y: number, attachesTo: text, confidence }, ['id', 'text', 'x', 'y', 'confidence']),
    },
    unknownMarks: {
      type: 'array',
      items: objectOf({ id: text, x: number, y: number, width: number, height: number, note: prose, confidence }, [
        'id',
        'x',
        'y',
        'width',
        'height',
        'note',
        'confidence',
      ]),
    },
    predictPoints: { type: 'array', items: objectOf({ id: text, a: text, b: text }, ['id', 'a', 'b']) },
  },
  ['lineWidth', 'items', 'joints', 'labels', 'unknownMarks', 'predictPoints'],
);

export const READER_PROMPT = `This is a photo of a whiteboard drawing of a physics setup that a class will watch play out.
Read it into the JSON format you are given. Give every position and size on a 0-1000 grid over this image: (0,0) is the top-left corner, x grows to the right and y grows downwards.

Items may only be these kinds:
- floor, wall, block, domino, lever: x, y is the centre; width and height; angleDegrees if drawn tilted (clockwise positive).
- ball: x, y is the centre; radius.
- cart: x, y, width and height are the cart's body (not its wheels); radius is the radius of its wheels.
- ramp: a straight line from (x, y) to (x2, y2).
- pivot: x, y is the point something turns on.
- pulley: x, y is the centre; radius.
- rope, spring: from and to are the ids of the two items it joins. If a rope runs over a pulley, from and to are the things hanging on each end, and over is the pulley's id.
The board uses a legend. A rectangle filled with diagonal hatching is a wall: it is fixed in place, whatever its shape. A plain rectangle can move: it is a domino if it is tall and thin, otherwise a block. A rectangle sitting on two small circles is a cart: the circles are its wheels, never balls. A circle with a dot at its centre is a pulley; a small triangle is a pivot. A straight line joining two items is a rope; a zigzag line joining two items is a spring. A zigzag that joins nothing is not a spring.
Something drawn standing on the floor or on another item rests on it: put its bottom edge exactly on that surface.
Ignore faint, faded or smudged grey marks: they are left over from an erased drawing and are not part of this one.
The image may instead be exported from a digital board, with clean strokes on a plain background. Strokes in any colour are part of the drawing, and colour does not change what an item is.
If an arrow is drawn next to a ball, block or cart to show a push, give that item push: dx, dy, the arrow from tail to head on the same grid.

Do not invent anything. Any mark that is not one of these kinds goes in unknownMarks, with a box around it and a short note of what it looks like. Handwritten words go in labels, with attachesTo set when a word names an item. A mass written next to an item, such as 5 kg, is a label attached to that item.
Add one predict point: the first contact between two items that the motion leads to, which is the moment just before the interesting part. Use a and b for the two item ids.
Measure each shape to the outer edge of its drawn lines, and give lineWidth: how thick a typical marker line is, on the same grid.
Use short ids such as ball, ramp, domino-1, domino-2 (numbered left to right). For each item, label and mark, give confidence from 0 to 1 for how sure you are it is really there as described.`;

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

const MASS_KINDS = new Set(['ball', 'block', 'domino', 'lever', 'cart']);
const WRITTEN_MASS = /^\s*(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?)\s*$/i;
const KILOGRAMS: Record<string, number> = { kg: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001 };

export const writtenMass = (text: string): number | undefined => {
  const match = WRITTEN_MASS.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  const kilograms = Number(match[1]) * (KILOGRAMS[match[2].toLowerCase()] ?? 0);
  return kilograms > 0 ? kilograms : undefined;
};

const NOT_GIVEN = new Set(['', 'null', 'none', 'undefined']);
const given = (reference: string | undefined): string | undefined =>
  reference === undefined || NOT_GIVEN.has(reference.trim().toLowerCase()) ? undefined : reference;
const withReference = (name: string, reference: string | undefined): Record<string, string> => {
  const value = given(reference);
  return value === undefined ? {} : { [name]: value };
};

export const drawingSize = (photo: ImageSize): ImageSize => {
  const scale = DRAWING_LONG_EDGE / Math.max(photo.width, photo.height);
  return { width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) };
};

export const toScene = (model: ModelScene, photo: ImageSize): unknown => {
  const size = drawingSize(photo);
  const sx = size.width / GRID;
  const sy = size.height / GRID;
  const px = (x: number | undefined) => (x === undefined ? undefined : clamp(x * sx, size.width));
  const py = (y: number | undefined) => (y === undefined ? undefined : clamp(y * sy, size.height));
  const spanX = (w: number | undefined) => (w === undefined ? undefined : w * sx);
  const spanY = (h: number | undefined) => (h === undefined ? undefined : h * sy);
  // The model measures outlined shapes to the outer edge of the marker line; the
  // object is what the line encloses, so take one line width off.
  const line = model.lineWidth ?? 0;
  const inner = (size: number | undefined, by: number) => (size === undefined ? undefined : Math.max(size - by, size / 2));
  const radius = (r: number | undefined) => (r === undefined ? undefined : ((inner(r, line / 2) ?? r) * (sx + sy)) / 2);

  const bodies = model.items.map((item): Record<string, unknown> => {
    const base = { id: item.id, kind: item.kind, confidence: item.confidence };
    const velocity = item.push ? { velocity: { x: item.push.dx * sx * ARROW_TO_SPEED, y: item.push.dy * sy * ARROW_TO_SPEED } } : {};
    const angle = item.angleDegrees === undefined ? {} : { angle: (item.angleDegrees * Math.PI) / 180 };
    switch (item.kind) {
      case 'ramp':
        return { ...base, x1: px(item.x), y1: py(item.y), x2: px(item.x2), y2: py(item.y2), thickness: RAMP_THICKNESS };
      case 'ball':
        return { ...base, x: px(item.x), y: py(item.y), radius: radius(item.radius), ...velocity };
      case 'pulley':
        return { ...base, x: px(item.x), y: py(item.y), radius: radius(item.radius) };
      case 'pivot':
        return { ...base, x: px(item.x), y: py(item.y) };
      case 'rope':
      case 'spring':
        return {
          ...base,
          ...withReference('from', item.from),
          ...withReference('to', item.to),
          ...(item.kind === 'rope' ? withReference('over', item.over) : {}),
        };
      case 'floor': {
        const y = py(item.y);
        const thickness = y === undefined ? 0 : Math.max(2, Math.min(FLOOR_THICKNESS, 2 * (size.height - y)));
        return item.height === undefined && y !== undefined
          ? { ...base, x: px(item.x), y: Math.min(size.height, y + thickness / 2), width: spanX(item.width), height: thickness }
          : { ...base, x: px(item.x), y, width: spanX(item.width), height: spanY(item.height) };
      }
      case 'wall':
        return { ...base, x: px(item.x), y: py(item.y), width: spanX(inner(item.width, line)), height: spanY(inner(item.height, line)) };
      case 'cart':
        return {
          ...base,
          x: px(item.x),
          y: py(item.y),
          width: spanX(inner(item.width, line)),
          height: spanY(inner(item.height, line)),
          wheelRadius: radius(item.radius),
          angle: 0,
          ...angle,
          ...velocity,
        };
      default:
        return {
          ...base,
          x: px(item.x),
          y: py(item.y),
          width: spanX(inner(item.width, line)),
          height: spanY(inner(item.height, line)),
          ...angle,
          ...velocity,
        };
    }
  });

  const centreOf = (id: unknown): { x: number; y: number } | null => {
    const found = bodies.find((body) => body.id === id);
    if (!found) return null;
    const [x, y] = found.kind === 'ramp' ? [((found.x1 as number) + (found.x2 as number)) / 2, ((found.y1 as number) + (found.y2 as number)) / 2] : [found.x, found.y];
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
  };
  const masses = new Map(
    model.labels.flatMap((entry) => {
      const kilograms = writtenMass(entry.text);
      const item = given(entry.attachesTo);
      return kilograms !== undefined && item !== undefined ? [[item, kilograms] as const] : [];
    }),
  );
  const items = bodies.map((body) => {
    if (body.kind !== 'rope' && body.kind !== 'spring') {
      const mass = typeof body.id === 'string' && MASS_KINDS.has(String(body.kind)) ? masses.get(body.id) : undefined;
      return mass === undefined ? body : { ...body, mass };
    }
    const [from, to, over] = [centreOf(body.from), centreOf(body.to), centreOf(body.over)];
    const span = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    const drawn = from && to ? (over ? span(from, over) + span(over, to) : span(from, to)) : 1;
    return { ...body, length: Math.max(1, drawn) };
  });

  return {
    version: 1,
    drawing: { width: size.width, height: size.height },
    items,
    joints: model.joints.map((joint) => ({ id: joint.id, kind: 'pin', a: joint.a, b: joint.b, x: px(joint.x), y: py(joint.y) })),
    labels: model.labels.map(({ attachesTo, ...label }) => ({ ...label, x: px(label.x), y: py(label.y), ...withReference('attachesTo', attachesTo) })),
    unknownMarks: model.unknownMarks.map((mark) => ({
      ...mark,
      x: px(mark.x),
      y: py(mark.y),
      width: spanX(mark.width),
      height: spanY(mark.height),
    })),
    predictPoints: model.predictPoints.map((point) => ({ id: point.id, trigger: { kind: 'contact', a: point.a, b: point.b } })),
  };
};

export type ModelPhoto = { bytes: Uint8Array; contentType: string; size: ImageSize };
export type CallRecord = { provider: ProviderName; status: number | null; ms: number; content: string | null; usage: Usage | null; error: string | null };
export const EFFORTS = ['minimal', 'low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORTS)[number];
export const parseEffort = (value: string | undefined): Effort | undefined => EFFORTS.find((effort) => effort === value);

export type CallOptions = { timeoutMs: number; fetchImpl?: typeof fetch; onCall?: (record: CallRecord) => void; effort?: Effort; retryDelayMs?: number };

const usageOf = (body: unknown): Usage | null => {
  const usage = typeof body === 'object' && body !== null && 'usage' in body ? body.usage : null;
  return typeof usage === 'object' && usage !== null && 'prompt_tokens' in usage && 'completion_tokens' in usage ? (usage as Usage) : null;
};

const errorMessage = (body: unknown): string | null => {
  const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return null;
};

const completionText = (body: unknown): string | null => {
  const choices = typeof body === 'object' && body !== null && 'choices' in body && Array.isArray(body.choices) ? body.choices : [];
  const content: unknown = choices[0]?.message?.content;
  return typeof content === 'string' ? content : null;
};

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type JsonSchema = { name: string; schema: Record<string, unknown> };

// A failure worth one more try: a dropped connection, a busy or failing server, or a garbled reply.
// A rejected key or request will fail the same way again, and a call that ran out of time has used
// up the budget, so neither is retried.
class ModelCallError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const RETRIES = 1;
const RETRY_DELAY_MS = 1000;
const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

const callModelOnce = async (
  content: ContentPart[],
  responseSchema: JsonSchema,
  provider: ProviderWithKey,
  options: CallOptions,
  timeoutMs: number,
): Promise<object> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const record = { provider: provider.name, status: null as number | null, content: null as string | null, usage: null as Usage | null };
  const report = (error: string | null): void => options.onCall?.({ ...record, ms: Math.round(performance.now() - started), error });
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          ...(options.effort ? { reasoning_effort: options.effort } : {}),
          messages: [{ role: 'user', content }],
          response_format: { type: 'json_schema', json_schema: responseSchema },
        }),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw new ModelCallError(`${provider.name} did not answer within ${Math.round(timeoutMs / 1000)} seconds`, false, { cause });
      }
      throw new ModelCallError(cause instanceof Error ? cause.message : String(cause), true, { cause });
    }
    record.status = response.status;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ModelCallError(`${provider.name} answered ${response.status}: ${errorMessage(body) ?? 'no error message'}`, isRetryableStatus(response.status));
    }
    record.usage = usageOf(body);
    record.content = completionText(body);
    let parsed: unknown;
    try {
      parsed = record.content === null ? null : JSON.parse(record.content);
    } catch {
      parsed = null;
    }
    if (typeof parsed !== 'object' || parsed === null) throw new ModelCallError(`${provider.name} did not return JSON`, true);
    report(null);
    return parsed;
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// timeoutMs is the budget for the whole request, retry included.
export const requestModelJson = async (
  content: ContentPart[],
  responseSchema: JsonSchema,
  provider: ProviderWithKey,
  options: CallOptions,
): Promise<object> => {
  const deadline = performance.now() + options.timeoutMs;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callModelOnce(content, responseSchema, provider, options, Math.max(1, deadline - performance.now()));
    } catch (error) {
      const retry = error instanceof ModelCallError && error.retryable && attempt < RETRIES;
      if (!retry) throw error;
      await wait(options.retryDelayMs ?? RETRY_DELAY_MS);
      if (performance.now() >= deadline) throw error;
    }
  }
};

export const readSceneWithModel = async (photo: ModelPhoto, provider: ProviderWithKey, options: CallOptions): Promise<unknown> => {
  const image = `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
  const parsed = await requestModelJson(
    [
      { type: 'text', text: READER_PROMPT },
      { type: 'image_url', image_url: { url: image } },
    ],
    { name: 'whiteboard_scene', schema: MODEL_SCENE_SCHEMA },
    provider,
    options,
  );
  return toScene(parsed as ModelScene, photo.size);
};
