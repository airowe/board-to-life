import { z } from 'zod';

export const ROLES = ['producer', 'consumer', 'decomposer'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_SPECIES = 24;
export const MAX_ARROWS = 100;

const id = z.string().min(1);
const confidence = z.number().min(0).max(1);
const coord = z.number();
const size = z.number().positive();

const species = z.object({
  id,
  name: z.string().min(1),
  role: z.enum(ROLES),
  x: coord,
  y: coord,
  width: size,
  height: size,
  count: z.number().min(0).optional(),
  confidence,
});

// `from` is eaten by `to`, so the arrow points the way the energy goes.
const eats = z.object({ id, from: id, to: id, confidence });

const event = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove'), species: id }),
  z.object({ kind: z.literal('drought') }),
]);

const label = z.object({ id, text: z.string().min(1), x: coord, y: coord, confidence });

const unknownMark = z.object({ id, x: coord, y: coord, width: size, height: size, note: z.string().min(1), confidence });

const webSchema = z.object({
  version: z.literal(1),
  drawing: z.object({ width: size, height: size }),
  species: z.array(species).max(MAX_SPECIES, `at most ${MAX_SPECIES} species are allowed`),
  eats: z.array(eats).max(MAX_ARROWS, `at most ${MAX_ARROWS} arrows are allowed`),
  labels: z.array(label),
  unknownMarks: z.array(unknownMark),
  event: event.nullable(),
});

export type Web = z.infer<typeof webSchema>;
export type Species = Web['species'][number];
export type Eats = Web['eats'][number];
export type WebEvent = z.infer<typeof event>;

export type WebValidationResult = { ok: true; web: Web } | { ok: false; errors: string[] };

export const NO_PRODUCER_ERROR = 'The web needs at least one producer, such as a plant.';

const duplicateIdErrors = (web: Web): string[] => {
  const seen = new Set<string>();
  const errors: string[] = [];
  const allIds = [...web.species, ...web.eats, ...web.labels, ...web.unknownMarks].map((entry) => entry.id);
  for (const each of allIds) {
    if (seen.has(each)) errors.push(`duplicate id "${each}"`);
    seen.add(each);
  }
  return errors;
};

const crossReferenceErrors = (web: Web): string[] => {
  const speciesIds = new Set(web.species.map((entry) => entry.id));
  const errors = duplicateIdErrors(web);
  for (const arrow of web.eats) {
    for (const end of [arrow.from, arrow.to]) {
      if (!speciesIds.has(end)) errors.push(`arrow "${arrow.id}" references missing species "${end}"`);
    }
  }
  const firstArrowFor = new Map<string, string>();
  for (const arrow of web.eats) {
    const pair = JSON.stringify([arrow.from, arrow.to]);
    const first = firstArrowFor.get(pair);
    if (first === undefined) firstArrowFor.set(pair, arrow.id);
    else errors.push(`arrow "${arrow.id}" repeats arrow "${first}" from "${arrow.from}" to "${arrow.to}"`);
  }
  if (web.event?.kind === 'remove' && !speciesIds.has(web.event.species)) {
    errors.push(`event removes missing species "${web.event.species}"`);
  }
  if (!web.species.some((entry) => entry.role === 'producer')) errors.push(NO_PRODUCER_ERROR);
  return errors;
};

const NAMED_COLLECTIONS = new Set(['species', 'eats', 'labels', 'unknownMarks']);

const idAt = (input: unknown, collection: string, index: number): string | undefined => {
  const entries = (input as Record<string, unknown> | null)?.[collection];
  const entry = Array.isArray(entries) ? (entries[index] as { id?: unknown } | null | undefined) : undefined;
  return typeof entry?.id === 'string' && entry.id !== '' ? entry.id : undefined;
};

const describeIssue = (input: unknown, issue: z.core.$ZodIssue): string => {
  const [collection, index, ...rest] = issue.path;
  const entryId = typeof collection === 'string' && typeof index === 'number' && NAMED_COLLECTIONS.has(collection) ? idAt(input, collection, index) : undefined;
  const where = entryId === undefined ? issue.path.join('.') || '(root)' : [collection, entryId, ...rest].join(' ');
  return `${where}: ${issue.message}`;
};

export const validateWeb = (input: unknown): WebValidationResult => {
  const parsed = webSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => describeIssue(input, issue)),
    };
  }
  const errors = crossReferenceErrors(parsed.data);
  return errors.length === 0 ? { ok: true, web: parsed.data } : { ok: false, errors };
};
