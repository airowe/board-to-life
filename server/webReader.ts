import { ROLES, type Role, type WebEvent } from '../src/ecosystem/schema';
import type { ImageSize } from './imageSize';
import { drawingSize, requestModelJson, type CallOptions, type ModelPhoto, type ProviderWithKey } from './sceneReader';

// The model reports positions on the same 0-1000 grid as physics scenes.
const GRID = 1000;

type ModelSpecies = { id: string; name: string; role: Role; x: number; y: number; width: number; height: number; count?: number; confidence: number };
export type ModelWeb = {
  species: ModelSpecies[];
  eats: { id: string; from: string; to: string; confidence: number }[];
  labels: { id: string; text: string; x: number; y: number; confidence: number }[];
  unknownMarks: { id: string; x: number; y: number; width: number; height: number; note: string; confidence: number }[];
  event: WebEvent | null;
};

const number = { type: 'number' };
const id = { type: 'string', maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' };
const prose = { type: 'string', maxLength: 120 };
const name = { type: 'string', minLength: 1, maxLength: 40 };
const confidence = { type: 'number', minimum: 0, maximum: 1 };
const objectOf = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const MODEL_WEB_SCHEMA = objectOf(
  {
    species: {
      type: 'array',
      items: objectOf(
        { id, name, role: { type: 'string', enum: ROLES }, x: number, y: number, width: number, height: number, count: { type: 'number', minimum: 0 }, confidence },
        ['id', 'name', 'role', 'x', 'y', 'width', 'height', 'confidence'],
      ),
    },
    eats: { type: 'array', items: objectOf({ id, from: id, to: id, confidence }, ['id', 'from', 'to', 'confidence']) },
    labels: { type: 'array', items: objectOf({ id, text: prose, x: number, y: number, confidence }, ['id', 'text', 'x', 'y', 'confidence']) },
    unknownMarks: {
      type: 'array',
      items: objectOf({ id, x: number, y: number, width: number, height: number, note: prose, confidence }, ['id', 'x', 'y', 'width', 'height', 'note', 'confidence']),
    },
    event: {
      anyOf: [
        { type: 'null' },
        objectOf({ kind: { type: 'string', enum: ['remove'] }, species: id }, ['kind', 'species']),
        objectOf({ kind: { type: 'string', enum: ['drought'] } }, ['kind']),
      ],
    },
  },
  ['species', 'eats', 'labels', 'unknownMarks', 'event'],
);

export const WEB_FORMAT = `Read it into the JSON format you are given.
Each species is one box on the board: give its name, its role (producer for plants and other things that make their own food, consumer for things that eat, decomposer for fungi and bacteria that break down the dead), and its box as the centre x, y plus width and height.
If a number is written next to a species, give it as count.
Each arrow is an eats entry: from is the species at the arrow's tail and to is the species at its head.
Write each name exactly as it is spelled on the board.
Use short ids such as grass, rabbit, fox, e1, e2, and give every species, arrow, label and mark a confidence from 0 to 1 for how sure you are it is really there as described.
Handwritten words that are not species names go in labels. Any mark that is not a species or an arrow goes in unknownMarks, with a box around it and a short note of what it looks like.`;

export const WEB_READER_PROMPT = `This is a photo of a whiteboard drawing of a food web that a class will watch as a population model.
Give every position and size on a 0-1000 grid over this image: (0,0) is the top-left corner, x grows to the right and y grows downwards.

${WEB_FORMAT}
Draw each arrow from the thing eaten to the thing that eats it: grass → rabbit means the rabbit eats the grass.
Read every arrow the way it is drawn, even if it looks backwards; never reverse one.
If an arrowhead is unclear, give that arrow a confidence below 0.7.
If a species is crossed out, or the board says something like drought or remove foxes, report it as the event.
The event is {"kind":"remove","species":id}, {"kind":"drought"}, or null when there is none.
Ignore faint, faded or smudged grey marks: they are left over from an erased drawing.
Do not invent species or arrows that are not drawn.`;

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

export const toWeb = (model: ModelWeb, photo: ImageSize): unknown => {
  const size = drawingSize(photo);
  const sx = size.width / GRID;
  const sy = size.height / GRID;
  const px = (x: number) => clamp(x * sx, size.width);
  const py = (y: number) => clamp(y * sy, size.height);
  const speciesIds = new Set(model.species.map((entry) => entry.id));
  const event = model.event?.kind === 'remove' && !speciesIds.has(model.event.species) ? null : model.event;

  return {
    version: 1,
    drawing: { width: size.width, height: size.height },
    species: model.species.map((entry) => ({ ...entry, x: px(entry.x), y: py(entry.y), width: entry.width * sx, height: entry.height * sy })),
    eats: model.eats,
    labels: model.labels.map((label) => ({ ...label, x: px(label.x), y: py(label.y) })),
    unknownMarks: model.unknownMarks.map((mark) => ({ ...mark, x: px(mark.x), y: py(mark.y), width: mark.width * sx, height: mark.height * sy })),
    event,
  };
};

export const readWebWithModel = async (photo: ModelPhoto, provider: ProviderWithKey, options: CallOptions): Promise<unknown> => {
  const image = `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
  const parsed = await requestModelJson(
    [
      { type: 'text', text: WEB_READER_PROMPT },
      { type: 'image_url', image_url: { url: image } },
    ],
    { name: 'food_web', schema: MODEL_WEB_SCHEMA },
    provider,
    options,
  );
  return toWeb(parsed as ModelWeb, photo.size);
};
