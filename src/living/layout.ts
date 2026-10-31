import type { Role, Species, Web } from '../ecosystem/schema';
import type { Habitat, Library, LibraryEntry, Zone } from '../library/manifest';
import { findLibrarySubject, guessZone, libraryFile } from '../library/match';

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

// Low enough that the habitat still shows above the plants.
export const PRODUCER_HEIGHT = 220;
export const FLOOR_ANIMAL_HEIGHT = 150;
export const SMALL_HEIGHT = 110;
export const SURFACE_HEIGHT = 130;

const STAGE_MARGIN = 48;
// A group's crowd fills this share of its slot, leaving a gap to its neighbours.
const SPREAD_FILL = 0.9;
// A wide picture is fitted to its group's height, but never wider than this many heights.
export const MAX_WIDTH_PER_HEIGHT = 1.6;
// Members of a crowd stand this share of a picture's width apart before they start to overlap.
export const SPACING_PER_WIDTH = 0.6;
// A lone group stays a crowd rather than spreading across the whole stage: at most this many spacings either side of
// its centre. The sky is open, so fliers may spread wider.
export const MAX_SPREAD_SPACINGS: Record<Zone, number> = { floor: 3, water: 3, surface: 3, sky: 5 };
// Plants cluster where they were drawn instead of carpeting the floor: a rooted crowd covers at most this share of the stage width.
export const ROOTED_MAX_SPREAD_SHARE = 0.4;
// How far a member may sit in front of or behind the group's line, so a crowd is not a queue.
const DEPTH_PX: Record<Zone, number> = { floor: 12, water: 60, surface: 0, sky: 40 };
// Room kept between a swimmer and the waterline or floor, covering its idle drift.
const WATER_MARGIN_PX = 20;
const ANIMAL_HEIGHT: Record<Zone, number> = { floor: FLOOR_ANIMAL_HEIGHT, water: SMALL_HEIGHT, surface: SURFACE_HEIGHT, sky: SMALL_HEIGHT };

// Stage px. `baseY` is the line the crowd stands on, floats at or swims and flies along; members sit up to `depth` above or below it.
// `spacing` is how far apart members stand before the crowd runs out of room.
export type Group = {
  speciesId: string;
  role: Role;
  zone: Zone;
  centreX: number;
  spread: number;
  baseY: number;
  depth: number;
  size: number;
  spacing: number;
};
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

// Fliers are always shown in flight: a perched bird hanging in mid-air reads wrong.
export const poseFileFor = (zone: Zone, moving: boolean): 'rest' | 'move' => (zone === 'sky' || moving ? 'move' : 'rest');

// Groups in one row share its width; rows (sky, water, surface, floor animals and rooted producers) overlap freely.
export const rowOf = (group: Pick<Group, 'zone' | 'role'>): string => `${group.zone}:${isRooted(group.role, group.zone) ? 'rooted' : 'free'}`;

const aspectOf = (library: Library, name: string, zone: Zone): number => {
  const subject = findLibrarySubject(library, name);
  const file = subject === null ? null : libraryFile(library, subject, poseFileFor(zone, false));
  const entry = file === null ? undefined : library.entries.find((item) => item.file === file);
  return entry ? Math.min(entry.width / entry.height, MAX_WIDTH_PER_HEIGHT) : 1;
};

const zoneOf = (library: Library, species: Species): Zone => libraryEntryFor(library, species.name)?.zone ?? guessZone(species.name);

// Plants and decomposers on the floor take root; a producer in open water (plankton) drifts like the swimmers.
export const isRooted = (role: Role, zone: Zone): boolean => role !== 'consumer' && zone === 'floor';

const sizeOf = (role: Role, zone: Zone): number => (role === 'producer' && zone !== 'water' ? PRODUCER_HEIGHT : ANIMAL_HEIGHT[zone]);

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
      const size = sizeOf(species.role, zone);
      const width = size * aspectOf(library, species.name, zone);
      return { species, zone, size, width, row: rowOf({ zone, role: species.role }) };
    });
  const leftByRow = new Map<string, number>();
  const pxPerWidthByRow = new Map<string, number>();
  for (const row of new Set(placed.map((entry) => entry.row))) {
    const totalWidth = placed.filter((entry) => entry.row === row).reduce((sum, entry) => sum + entry.width, 0);
    leftByRow.set(row, STAGE_MARGIN);
    pxPerWidthByRow.set(row, (STAGE.width - 2 * STAGE_MARGIN) / Math.max(totalWidth, 1));
  }
  const groups = placed.map(({ species, zone, size, width, row }): Group => {
    const slot = width * (pxPerWidthByRow.get(row) ?? 0);
    const left = leftByRow.get(row) ?? STAGE_MARGIN;
    leftByRow.set(row, left + slot);
    const baseY = lineOf(habitat, zone);
    const spacing = width * SPACING_PER_WIDTH;
    const rooted = isRooted(species.role, zone);
    const widest = Math.min((slot / 2) * SPREAD_FILL, MAX_SPREAD_SPACINGS[zone] * spacing);
    const spread = rooted ? Math.min(widest, (ROOTED_MAX_SPREAD_SHARE * STAGE.width) / 2) : widest;
    // A plant stands as near its board position as its own slot allows; animals keep to the middle of theirs.
    const drawnAt = STAGE_MARGIN + (species.x / web.drawing.width) * (STAGE.width - 2 * STAGE_MARGIN);
    const centreX = rooted ? Math.min(Math.max(drawnAt, left + spread), left + slot - spread) : left + slot / 2;
    return {
      speciesId: species.id,
      role: species.role,
      zone,
      centreX,
      spread,
      baseY,
      depth: depthOf(habitat, zone, baseY, size),
      size,
      spacing,
    };
  });
  return { habitat, groups };
};
