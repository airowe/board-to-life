import type { Role, Species, Web } from '../ecosystem/schema';
import type { Habitat, Library, LibraryEntry, Zone } from '../library/manifest';
import { findLibrarySubject, guessZone } from '../library/match';

export const STAGE = { width: 1536, height: 1024 };
// Measured on the habitat backgrounds (grassland 0.86, kelp forest 0.875, pond 0.88, woodland 0.89).
export const FLOOR_Y = 0.86;
const KELP_SURFACE_Y = 0.12;
// Measured on bg-pond.webp: the water's surface band runs from 0.505 to 0.555 of the height.
const POND_SURFACE_Y = 0.52;
const OPEN_WATER_Y = 0.55;
const SKY_Y = 0.28;
// Land habitats have no water, so floaters stand on the floor there.
export const SURFACE_Y_BY_HABITAT: Record<Habitat, number> = {
  'kelp-forest': KELP_SURFACE_Y,
  pond: POND_SURFACE_Y,
  grassland: FLOOR_Y,
  woodland: FLOOR_Y,
  desert: FLOOR_Y,
  tabletop: FLOOR_Y,
  lab: FLOOR_Y,
};
export const WATER_Y_BY_HABITAT: Record<Habitat, number> = {
  'kelp-forest': OPEN_WATER_Y,
  pond: (POND_SURFACE_Y + FLOOR_Y) / 2,
  grassland: OPEN_WATER_Y,
  woodland: OPEN_WATER_Y,
  desert: OPEN_WATER_Y,
  tabletop: OPEN_WATER_Y,
  lab: OPEN_WATER_Y,
};
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
// How far a member may sit in front of or behind the group's line, so a crowd is not a queue.
const DEPTH_PX: Record<Zone, number> = { floor: 12, water: 60, surface: 0, sky: 40 };
// Room kept between a swimmer and the waterline or floor, covering its idle drift.
const WATER_MARGIN_PX = 20;
const ANIMAL_HEIGHT: Record<Zone, number> = { floor: FLOOR_ANIMAL_HEIGHT, water: SMALL_HEIGHT, surface: SURFACE_HEIGHT, sky: SMALL_HEIGHT };

// Stage px. `baseY` is the line the crowd stands on, floats at or swims and flies along; members sit up to `depth` above or below it.
export type Group = { speciesId: string; role: Role; zone: Zone; centreX: number; spread: number; baseY: number; depth: number; size: number };
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

const lineOf = (habitat: Habitat, zone: Zone): number => {
  if (zone === 'surface') return SURFACE_Y_BY_HABITAT[habitat] * STAGE.height;
  if (zone === 'water') return WATER_Y_BY_HABITAT[habitat] * STAGE.height;
  return (zone === 'floor' ? FLOOR_Y : SKY_Y) * STAGE.height;
};

const depthOf = (habitat: Habitat, zone: Zone, baseY: number, size: number): number => {
  if (zone !== 'water') return DEPTH_PX[zone];
  const room = Math.min(baseY - SURFACE_Y_BY_HABITAT[habitat] * STAGE.height, FLOOR_Y * STAGE.height - baseY) - size / 2 - WATER_MARGIN_PX;
  return Math.max(0, Math.min(DEPTH_PX.water, room));
};

export const layoutPlace = (web: Web, library: Library): PlaceLayout => {
  const habitat = habitatFor(web, library);
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
    const baseY = lineOf(habitat, zone);
    return {
      speciesId: species.id,
      role: species.role,
      zone,
      centreX,
      spread: Math.min((slot / 2) * SPREAD_FILL, size * MAX_SPREAD_PER_HEIGHT),
      baseY,
      depth: depthOf(habitat, zone, baseY, size),
      size,
    };
  });
  return { habitat, groups };
};
