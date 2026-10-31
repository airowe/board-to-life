import { STEPS_PER_SECOND_SHOWN } from '../ecosystem/model';
import type { Web } from '../ecosystem/schema';
import type { LivePictures } from '../library/live';
import type { Habitat, Library, Zone } from '../library/manifest';
import { libraryFile } from '../library/match';
import type { PictureSource } from '../library/source';
import type { IndividualPose } from '../living/crowd';
import { LABEL_FADE_STEPS, type PinnedLabel } from '../living/labels';
import { FLOOR_Y, STAGE, SURFACE_Y_BY_HABITAT, type Group, type PlaceLayout } from '../living/layout';
import { sizeCanvas } from './canvasSize';

// Tunable by eye. Stage px are the 1536 × 1024 background's pixels; screen px are CSS pixels on the canvas.
const LIBRARY_ROOT = '/library/';
export const FALLBACK_FOLDER = 'fallback/';
const BACKGROUND_FILL = '#cfe3ea';
// Stage px kept visible below the floor line when a wide canvas crops the background top and bottom.
const FLOOR_KEEP_PX = 60;
// Share of a floater's height that sits below the waterline.
const SURFACE_SUBMERGE = 0.25;
// A wide picture is fitted to its group's height, but never wider than this many heights.
const MAX_WIDTH_PER_HEIGHT = 1.6;
// Library and live pictures are drawn facing right; Fluent emoji animals mostly face left.
const LIBRARY_FACING = 1;
const LIVE_FACING = 1;
const EMOJI_FACING = -1;
const CROSSFADE_SECONDS = 0.5;
const LABEL_FADE_SECONDS = LABEL_FADE_STEPS / STEPS_PER_SECOND_SHOWN;
// The longest frame a fade advances by, so a hidden tab does not finish every fade in one jump.
const MAX_FADE_STEP_SECONDS = 0.1;
// A species with no picture at all is drawn as today's ring, with its name under the group (stage px).
const RING_WIDTH = 6;
const RING_FILL_ALPHA = 0.18;
const NAME_FONT = '700 34px system-ui, sans-serif';
const NAME_GAP = 12;
// Labels, in screen px: the font scales with the canvas height, within limits.
const LABEL_FONT_SHARE = 0.032;
const LABEL_FONT_MIN_PX = 16;
const LABEL_FONT_MAX_PX = 40;
const LABEL_PAD_X_EM = 0.6;
const LABEL_PAD_Y_EM = 0.35;
const LABEL_GAP_PX = 12;
const LABEL_MARGIN_PX = 12;
const LEADER_WIDTH = 2;
const LABEL_FILL = 'rgba(255, 255, 255, 0.94)';
const LABEL_INK = '#1d2433';
const LEADER_INK = 'rgba(29, 36, 51, 0.75)';
// How far a group's pictures can reach past its size (scale variety, producer vigour), and the idle bob kept clear (stage px).
const GROUP_HEIGHT_ALLOWANCE = 1.25;
const GROUP_CLEARANCE_PX = 16;
// Back to front.
const ZONE_ORDER: readonly Zone[] = ['sky', 'water', 'floor', 'surface'];

export type PlaceImages = { get: (file: string) => HTMLImageElement | null };
export type PlaceFrame = {
  web: Web;
  layout: PlaceLayout;
  poses: Map<string, IndividualPose[]>;
  labels: PinnedLabel[];
  sources: Record<string, PictureSource>;
  images: PlaceImages;
  live: LivePictures;
  library: Library;
  colours: Map<string, string>;
  // Wall-clock seconds, the same clock the crowd tracker runs on.
  seconds: number;
};

// Loads `/library/<file>` (or `/library/fallback/<file>` for `fallback/<file>`) on first ask; null until it has loaded.
export const createPlaceImages = (onLoad: () => void): PlaceImages => {
  const images = new Map<string, HTMLImageElement>();
  const loaded = new Set<string>();
  return {
    get: (file) => {
      let image = images.get(file);
      if (!image) {
        const fresh = new Image();
        fresh.decoding = 'async';
        fresh.addEventListener('load', () => {
          loaded.add(file);
          onLoad();
        });
        fresh.src = `${LIBRARY_ROOT}${file}`;
        images.set(file, fresh);
        image = fresh;
      }
      return loaded.has(file) ? image : null;
    },
  };
};

type Anchor = 'foot' | 'float' | 'middle';
// How much of a picture sits above its pose's y.
const ABOVE_SHARE: Record<Anchor, number> = { foot: 1, float: 1 - SURFACE_SUBMERGE, middle: 0.5 };

const anchorOf = (group: Group, habitat: Habitat): Anchor => {
  if (group.zone === 'surface') return SURFACE_Y_BY_HABITAT[habitat] === FLOOR_Y ? 'foot' : 'float';
  return group.zone === 'floor' ? 'foot' : 'middle';
};

type Picture = { kind: 'image'; image: CanvasImageSource; width: number; height: number; facing: number } | { kind: 'ring' };
type Rect = { x: number; y: number; width: number; height: number };
type LabelState = { label: PinnedLabel; alpha: number; present: boolean; rect: Rect | null; below: boolean };
type SourceState = { key: string; source: PictureSource; previous: PictureSource | null; since: number };
type Memory = {
  seconds: number | null;
  size: string;
  labels: Map<string, LabelState>;
  sources: Map<string, SourceState>;
  files: Map<string, string | null>;
};

const memories = new WeakMap<HTMLCanvasElement, Memory>();

const memoryOf = (canvas: HTMLCanvasElement): Memory => {
  const existing = memories.get(canvas);
  if (existing) return existing;
  const fresh: Memory = { seconds: null, size: '', labels: new Map(), sources: new Map(), files: new Map() };
  memories.set(canvas, fresh);
  return fresh;
};

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));
const clamp01 = (value: number): number => clamp(value, 0, 1);

const sourceKey = (source: PictureSource): string => {
  if (source.kind === 'library') return `library:${source.subject}`;
  if (source.kind === 'live') return `live:${source.key}`;
  if (source.kind === 'emoji') return `emoji:${source.file}`;
  return 'drawing';
};

const fileFor = (memory: Memory, library: Library, subject: string, pose: 'rest' | 'move'): string | null => {
  const key = `${subject}#${pose}`;
  if (!memory.files.has(key)) memory.files.set(key, libraryFile(library, subject, pose));
  return memory.files.get(key) ?? null;
};

const imagePicture = (image: CanvasImageSource | null, facing: number): Picture | null => {
  if (!image) return null;
  const { width, height } =
    image instanceof HTMLImageElement ? { width: image.naturalWidth, height: image.naturalHeight } : (image as { width: number; height: number });
  return width > 0 && height > 0 ? { kind: 'image', image, width, height, facing } : null;
};

const pictureOf = (source: PictureSource, moving: boolean, frame: PlaceFrame, memory: Memory): Picture | null => {
  switch (source.kind) {
    case 'library': {
      const file = fileFor(memory, frame.library, source.subject, moving ? 'move' : 'rest');
      return file === null ? null : imagePicture(frame.images.get(file), LIBRARY_FACING);
    }
    case 'live':
      return imagePicture(frame.live.image(source.key), LIVE_FACING);
    case 'emoji':
      return imagePicture(frame.images.get(`${FALLBACK_FOLDER}${source.file}`), EMOJI_FACING);
    case 'drawing':
      return { kind: 'ring' };
  }
};

// Background scaled to cover the canvas, centred, then nudged up if that would crop the floor.
const coverView = (width: number, height: number): { scale: number; offsetX: number; offsetY: number } => {
  const scale = Math.max(width / STAGE.width, height / STAGE.height);
  const centred = (height - STAGE.height * scale) / 2;
  const floorFits = height - (FLOOR_Y * STAGE.height + FLOOR_KEEP_PX) * scale;
  return { scale, offsetX: (width - STAGE.width * scale) / 2, offsetY: Math.max(height - STAGE.height * scale, Math.min(centred, floorFits)) };
};

const drawIndividual = (
  ctx: CanvasRenderingContext2D,
  picture: Picture,
  pose: IndividualPose,
  group: Group,
  anchor: Anchor,
  alpha: number,
  colour: string,
): void => {
  if (alpha <= 0) return;
  const tall = group.size * pose.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rotation);
  if (picture.kind === 'ring') {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = RING_WIDTH;
    ctx.beginPath();
    ctx.arc(0, tall * (0.5 - ABOVE_SHARE[anchor]), tall / 2, 0, Math.PI * 2);
    ctx.globalAlpha = alpha * RING_FILL_ALPHA;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.stroke();
  } else {
    const fit = Math.min(1, (tall * MAX_WIDTH_PER_HEIGHT) / ((tall * picture.width) / picture.height));
    const height = tall * fit;
    const width = (height * picture.width) / picture.height;
    ctx.scale(pose.facing * picture.facing, 1);
    ctx.drawImage(picture.image, -width / 2, -height * ABOVE_SHARE[anchor], width, height);
  }
  ctx.restore();
};

const drawName = (ctx: CanvasRenderingContext2D, group: Group, anchor: Anchor, name: string, colour: string): void => {
  ctx.save();
  ctx.font = NAME_FONT;
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(name, group.centreX, group.baseY + group.size * (1 - ABOVE_SHARE[anchor]) + group.depth + NAME_GAP);
  ctx.restore();
};

const trackSource = (memory: Memory, id: string, source: PictureSource, seconds: number): SourceState => {
  const key = sourceKey(source);
  const known = memory.sources.get(id);
  if (known?.key === key) return known;
  const next: SourceState = { key, source, previous: known ? known.source : null, since: seconds };
  memory.sources.set(id, next);
  return next;
};

const drawIndividuals = (ctx: CanvasRenderingContext2D, frame: PlaceFrame, memory: Memory): void => {
  const { layout, poses, seconds } = frame;
  for (const zone of ZONE_ORDER) {
    for (const group of layout.groups) {
      if (group.zone !== zone) continue;
      const members = [...(poses.get(group.speciesId) ?? [])].sort((a, b) => a.y - b.y);
      const source = frame.sources[group.speciesId] ?? { kind: 'drawing' };
      const tracked = trackSource(memory, group.speciesId, source, seconds);
      const blend = tracked.previous ? clamp01((seconds - tracked.since) / CROSSFADE_SECONDS) : 1;
      const anchor = anchorOf(group, layout.habitat);
      const colour = frame.colours.get(group.speciesId) ?? LABEL_INK;
      // Asking for the travelling pose up front starts it loading before anyone needs it.
      pictureOf(source, true, frame, memory);
      for (const pose of members) {
        const current = pictureOf(source, pose.moving, frame, memory);
        const previous = tracked.previous && blend < 1 ? pictureOf(tracked.previous, pose.moving, frame, memory) : null;
        if (previous) drawIndividual(ctx, previous, pose, group, anchor, pose.alpha * (1 - blend), colour);
        if (current) drawIndividual(ctx, current, pose, group, anchor, pose.alpha * (previous ? blend : 1), colour);
      }
      if (source.kind === 'drawing' && members.length > 0) {
        drawName(ctx, group, anchor, frame.web.species.find((entry) => entry.id === group.speciesId)?.name ?? '', colour);
      }
    }
  }
};

type Point = { x: number; y: number };
type Extent = { top: number; bottom: number; centre: Point };

const extentOf = (group: Group, habitat: Habitat, toScreen: (point: Point) => Point): Extent => {
  const above = ABOVE_SHARE[anchorOf(group, habitat)];
  const tall = group.size * GROUP_HEIGHT_ALLOWANCE;
  const top = toScreen({ x: group.centreX, y: group.baseY - group.depth - tall * above - GROUP_CLEARANCE_PX });
  const bottom = toScreen({ x: group.centreX, y: group.baseY + group.depth + tall * (1 - above) + GROUP_CLEARANCE_PX });
  const centre = toScreen({ x: group.centreX, y: group.baseY + group.size * (0.5 - above) });
  return { top: top.y, bottom: bottom.y, centre };
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width + LABEL_GAP_PX && b.x < a.x + a.width + LABEL_GAP_PX && a.y < b.y + b.height + LABEL_GAP_PX && b.y < a.y + a.height + LABEL_GAP_PX;

const placeLabel = (
  size: { width: number; height: number },
  pill: { width: number; height: number },
  extent: Extent | null,
  placed: Rect[],
): { rect: Rect; below: boolean } => {
  const x = clamp((extent?.centre.x ?? size.width / 2) - pill.width / 2, LABEL_MARGIN_PX, size.width - LABEL_MARGIN_PX - pill.width);
  const maxY = size.height - LABEL_MARGIN_PX - pill.height;
  if (!extent) {
    let y = LABEL_MARGIN_PX;
    while (placed.some((other) => overlaps({ x, y, ...pill }, other)) && y < maxY) y += pill.height + LABEL_GAP_PX;
    return { rect: { x, y: Math.min(y, maxY), ...pill }, below: false };
  }
  const aboveY = extent.top - LABEL_GAP_PX - pill.height;
  const below = aboveY < LABEL_MARGIN_PX;
  let y = below ? extent.bottom + LABEL_GAP_PX : aboveY;
  for (const other of placed) {
    if (!overlaps({ x, y, ...pill }, other)) continue;
    y = below ? other.y + other.height + LABEL_GAP_PX : other.y - LABEL_GAP_PX - pill.height;
  }
  return { rect: { x, y: clamp(y, LABEL_MARGIN_PX, maxY), ...pill }, below };
};

const labelKey = (label: PinnedLabel): string => `${label.speciesId ?? ''}|${label.text}`;

const fadeLabels = (memory: Memory, labels: PinnedLabel[], seconds: number): void => {
  const step = memory.seconds === null ? 0 : clamp(seconds - memory.seconds, 0, MAX_FADE_STEP_SECONDS) / LABEL_FADE_SECONDS;
  for (const state of memory.labels.values()) state.present = false;
  for (const label of labels) {
    const key = labelKey(label);
    const state = memory.labels.get(key) ?? { label, alpha: 0, present: true, rect: null, below: false };
    state.present = true;
    memory.labels.set(key, state);
  }
  for (const [key, state] of memory.labels) {
    state.alpha = clamp01(state.alpha + (state.present ? step : -step));
    if (!state.present && state.alpha <= 0) memory.labels.delete(key);
  }
};

const labelFontPx = (height: number): number => clamp(height * LABEL_FONT_SHARE, LABEL_FONT_MIN_PX, LABEL_FONT_MAX_PX);

const layoutLabels = (
  ctx: CanvasRenderingContext2D,
  memory: Memory,
  frame: PlaceFrame,
  size: { width: number; height: number },
  toScreen: (point: Point) => Point,
): Map<LabelState, Extent | null> => {
  const fontPx = labelFontPx(size.height);
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const groups = new Map(frame.layout.groups.map((group) => [group.speciesId, group]));
  const extents = new Map<LabelState, Extent | null>();
  const states = [...memory.labels.values()].sort((a, b) => Number(b.rect !== null) - Number(a.rect !== null) || a.label.since - b.label.since);
  const placed: Rect[] = [];
  for (const state of states) {
    const group = state.label.speciesId === null ? undefined : groups.get(state.label.speciesId);
    const extent = group ? extentOf(group, frame.layout.habitat, toScreen) : null;
    extents.set(state, extent);
    if (!state.rect) {
      const pill = { width: ctx.measureText(state.label.text).width + 2 * LABEL_PAD_X_EM * fontPx, height: fontPx * (1 + 2 * LABEL_PAD_Y_EM) };
      const spot = placeLabel(size, pill, extent, placed);
      state.rect = spot.rect;
      state.below = spot.below;
    }
    placed.push(state.rect);
  }
  return extents;
};

const drawLeaders = (ctx: CanvasRenderingContext2D, extents: Map<LabelState, Extent | null>): void => {
  ctx.save();
  ctx.strokeStyle = LEADER_INK;
  ctx.lineWidth = LEADER_WIDTH;
  ctx.lineCap = 'round';
  for (const [state, extent] of extents) {
    if (!extent || !state.rect) continue;
    ctx.globalAlpha = state.alpha;
    const startX = clamp(extent.centre.x, state.rect.x, state.rect.x + state.rect.width);
    ctx.beginPath();
    ctx.moveTo(startX, state.below ? state.rect.y : state.rect.y + state.rect.height);
    ctx.lineTo(extent.centre.x, extent.centre.y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawPills = (ctx: CanvasRenderingContext2D, memory: Memory, height: number): void => {
  const fontPx = labelFontPx(height);
  ctx.save();
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const state of memory.labels.values()) {
    const { rect } = state;
    if (!rect) continue;
    ctx.globalAlpha = state.alpha;
    ctx.fillStyle = LABEL_FILL;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, rect.height / 2);
    ctx.fill();
    ctx.fillStyle = LABEL_INK;
    ctx.fillText(state.label.text, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
  ctx.restore();
};

export const drawPlace = (canvas: HTMLCanvasElement, frame: PlaceFrame): void => {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const memory = memoryOf(canvas);
  const sizeKey = `${width}x${height}`;
  if (memory.size !== sizeKey) {
    memory.size = sizeKey;
    for (const state of memory.labels.values()) state.rect = null;
  }
  const view = coverView(width, height);
  const toScreen = (point: Point): Point => ({ x: view.offsetX + point.x * view.scale, y: view.offsetY + point.y * view.scale });

  fadeLabels(memory, frame.labels, frame.seconds);
  memory.seconds = frame.seconds;
  const extents = layoutLabels(ctx, memory, frame, { width, height }, toScreen);

  ctx.fillStyle = BACKGROUND_FILL;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  const background = frame.images.get(`bg-${frame.layout.habitat}.webp`);
  if (background) ctx.drawImage(background, 0, 0, STAGE.width, STAGE.height);
  ctx.restore();

  drawLeaders(ctx, extents);

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  drawIndividuals(ctx, frame, memory);
  ctx.restore();

  drawPills(ctx, memory, height);
};
