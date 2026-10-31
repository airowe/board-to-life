import type { Role, Species, Web } from '../ecosystem/schema';
import type { Habitat, Library, LibraryEntry, Zone } from '../library/manifest';
import { findLibrarySubject, guessZone } from '../library/match';

export const STAGE = { width: 1536, height: 1024 };
// Measured on the habitat backgrounds (grassland 0.86, kelp forest 0.875, pond 0.88, woodland 0.89).
export const FLOOR_Y = 0.86;
export const SURFACE_Y = 0.12;
const WATER_Y = 0.55;
const SKY_Y = 0.28;
export const DEFAULT_HABITAT: Habitat = 'grassland';

export const PRODUCER_HEIGHT = 300;
export const FLOOR_ANIMAL_HEIGHT = 150;
export const SMALL_HEIGHT = 110;
export const SURFACE_HEIGHT = 130;

const STAGE_MARGIN = 48;
// A group's crowd fills this share of its slot, leaving a gap to its neighbours.
const SPREAD_FILL = 0.8;
// A lone group stays a crowd rather than spreading across the whole stage.
const MAX_SPREAD_PER_HEIGHT = 1.5;

const ZONE_Y: Record<Zone, number> = { floor: FLOOR_Y, water: WATER_Y, surface: SURFACE_Y, sky: SKY_Y };
const ANIMAL_HEIGHT: Record<Zone, number> = { floor: FLOOR_ANIMAL_HEIGHT, water: SMALL_HEIGHT, surface: SURFACE_HEIGHT, sky: SMALL_HEIGHT };

export type Group = { speciesId: string; role: Role; zone: Zone; centreX: number; spread: number; baseY: number; size: number }; // stage px
export type PlaceLayout = { habitat: Habitat; groups: Group[] };

const libraryEntryFor = (library: Library, name: string): LibraryEntry | null => {
  const subject = findLibrarySubject(library, name);
  return subject === null ? null : (library.entries.find((entry) => entry.subject === subject) ?? null);
};

export const habitatFor = (web: Web, library: Library): Habitat => {
  const votes = new Map<Habitat, number>();
  for (const species of web.species) {
    const habitat = libraryEntryFor(library, species.name)?.habitat ?? null;
    if (habitat !== null) votes.set(habitat, (votes.get(habitat) ?? 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first === undefined || (second !== undefined && second[1] === first[1])) return DEFAULT_HABITAT;
  return first[0];
};

const zoneOf = (library: Library, species: Species): Zone => libraryEntryFor(library, species.name)?.zone ?? guessZone(species.name);

const sizeOf = (role: Role, zone: Zone): number => (role === 'producer' ? PRODUCER_HEIGHT : ANIMAL_HEIGHT[zone]);

export const layoutPlace = (web: Web, library: Library): PlaceLayout => {
  const placed = [...web.species]
    .sort((a, b) => a.x - b.x)
    .map((species) => {
      const zone = zoneOf(library, species);
      return { species, zone, size: sizeOf(species.role, zone) };
    });
  const totalSize = placed.reduce((sum, entry) => sum + entry.size, 0);
  const pxPerSize = (STAGE.width - 2 * STAGE_MARGIN) / Math.max(totalSize, 1);
  let left = STAGE_MARGIN;
  const groups = placed.map(({ species, zone, size }): Group => {
    const slot = size * pxPerSize;
    const centreX = left + slot / 2;
    left += slot;
    return {
      speciesId: species.id,
      role: species.role,
      zone,
      centreX,
      spread: Math.min((slot / 2) * SPREAD_FILL, size * MAX_SPREAD_PER_HEIGHT),
      baseY: ZONE_Y[zone] * STAGE.height,
      size,
    };
  });
  return { habitat: habitatFor(web, library), groups };
};
