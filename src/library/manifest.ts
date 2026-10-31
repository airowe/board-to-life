import { z } from 'zod';

export const HABITATS = ['kelp-forest', 'grassland', 'woodland', 'pond', 'desert', 'tabletop', 'lab'] as const;
export type Habitat = (typeof HABITATS)[number];

export const ZONES = ['floor', 'water', 'surface', 'sky'] as const;
export type Zone = (typeof ZONES)[number];

const LIBRARY_URL = '/library/manifest.json';
const FALLBACK_URL = '/library/fallback/manifest.json';

const libraryEntry = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  pose: z.enum(['rest', 'move', 'still']),
  group: z.enum(['organism', 'prop', 'background']),
  aliases: z.array(z.string()),
  habitat: z.enum(HABITATS).nullable(),
  zone: z.enum(ZONES).nullable(),
  file: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
});

const librarySchema = z.object({ entries: z.array(libraryEntry) });
const fallbackSchema = z.object({ entries: z.array(z.object({ name: z.string().min(1), file: z.string().min(1) })) });

export type LibraryEntry = z.infer<typeof libraryEntry>;
export type Library = { entries: LibraryEntry[] };
export type FallbackEntry = { name: string; file: string };

export const parseLibrary = (json: unknown): Library => ({ entries: librarySchema.parse(json).entries });

export const parseFallback = (json: unknown): FallbackEntry[] => fallbackSchema.parse(json).entries;

const fetchJson = async (fetcher: typeof fetch, url: string): Promise<unknown> => {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
};

export const loadLibrary = async (fetcher: typeof fetch = fetch): Promise<{ library: Library; fallback: FallbackEntry[] }> => {
  const [library, fallback] = await Promise.all([fetchJson(fetcher, LIBRARY_URL), fetchJson(fetcher, FALLBACK_URL)]);
  return { library: parseLibrary(library), fallback: parseFallback(fallback) };
};
