import { STEPS_PER_SECOND_SHOWN } from '../ecosystem/model';
import type { Web } from '../ecosystem/schema';
import type { LivePictures } from '../library/live';
import type { Habitat, Library, Zone } from '../library/manifest';
import { libraryFile } from '../library/match';
import type { PictureSource } from '../library/source';
import type { IndividualPose } from '../living/crowd';
import { LABEL_FADE_STEPS, type PinnedLabel } from '../living/labels';
import { FLOOR_Y, MAX_WIDTH_PER_HEIGHT, STAGE, SURFACE_Y_BY_HABITAT, isRooted, poseFileFor, type Group, type PlaceLayout } from '../living/layout';
import { viewOf, type View } from '../present/view';
import { sizeCanvas } from './canvasSize';

// Tunable by eye. Stage px are the 1536 × 1024 background's pixels; screen px are CSS pixels on the canvas.
export const LIBRARY_ROOT = '/library/';
export const FALLBACK_FOLDER = 'fallback/';
const BACKGROUND_FILL = '#cfe3ea';
// Share of a floater's height that sits below the waterline.
const SURFACE_SUBMERGE = 0.25;
// Library and live pictures are drawn facing right; Fluent emoji animals mostly face left.
const LIBRARY_FACING = 1;
const LIVE_FACING = 1;
const EMOJI_FACING = -1;
export const CROSSFADE_SECONDS = 0.5;
export const LABEL_FADE_SECONDS = LABEL_FADE_STEPS / STEPS_PER_SECOND_SHOWN;
// The longest frame a fade advances by, so a hidden tab does not finish every fade in one jump.
export const MAX_FADE_STEP_SECONDS = 0.1;
// A species with no picture at all is drawn as today's ring, with its name under the group (stage px).
const RING_WIDTH = 6;
const RING_FILL_ALPHA = 0.18;
const NAME_FONT = '700 34px system-ui, sans-serif';
const NAME_GAP = 12;
// Labels, in screen px: the font scales with the canvas height, within limits.
const LABEL_FONT_SHARE = 0.022;
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
  // Fades are instant: a picture or label swaps at once rather than easing in.
  reducedMotion: boolean;
};

// How far a picture swap has gone, from 0 (the old picture) to 1 (the new one).
export const crossfadeBlend = (seconds: number, since: number, reducedMotion: boolean): number =>
  reducedMotion ? 1 : Math.min(Math.max((seconds - since) / CROSSFADE_SECONDS, 0), 1);

// A label's opacity after `elapsed` seconds, rising while it is present and falling once it is dropped.
export const labelAlpha = (alpha: number, present: boolean, elapsed: number, reducedMotion: boolean): number => {
  if (reducedMotion) return present ? 1 : 0;
  const step = Math.min(Math.max(elapsed, 0), MAX_FADE_STEP_SECONDS) / LABEL_FADE_SECONDS;
  return Math.min(Math.max(alpha + (present ? step : -step), 0), 1);
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

// Pictures are wider than tall by varying amounts, so a tap counts within this much of the height either side.
const TAP_HALF_WIDTH_PER_HEIGHT = 0.75;

// The species under a point on the stage: the nearest visible individual, reaching past its picture by `reach`.
export const pickPlaceSpecies = (groups: Group[], poses: Map<string, IndividualPose[]>, habitat: Habitat, point: { x: number; y: number }, reach: number): string | null => {
  let best: { id: string; distance: number } | null = null;
  for (const group of groups) {
    const above = ABOVE_SHARE[anchorOf(group, habitat)];
    for (const pose of poses.get(group.speciesId) ?? []) {
      if (pose.alpha <= 0) continue;
      const tall = group.size * pose.scale;
      const [dx, dy] = [Math.abs(point.x - pose.x), Math.abs(point.y - (pose.y + tall * (0.5 - above)))];
      if (dx > tall * TAP_HALF_WIDTH_PER_HEIGHT + reach || dy > tall / 2 + reach) continue;
      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) best = { id: group.speciesId, distance };
    }
  }
  return best?.id ?? null;
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

const pictureOf = (source: PictureSource, pose: 'rest' | 'move', frame: PlaceFrame, memory: Memory): Picture | null => {
  switch (source.kind) {
    case 'library': {
      const file = fileFor(memory, frame.library, source.subject, pose);
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

// The whole stage, as large as fits: no individual or label is ever cropped. Spare width is shared either side; spare
// height goes above, so the floor stays on the canvas's bottom edge. drawBackground fills the spare room.
export const stageView = (width: number, height: number): View => {
  const view = viewOf({ width, height }, STAGE);
  return { ...view, offsetY: height - STAGE.height * view.scale };
};

// Rows at the top of the background that are stretched upward to fill spare height: always sky (or open water).
const SKY_STRIP_ROWS = 4;
// The picture's very top rows are a touch lighter than the sky under them, which would show as a seam.
const SKY_STRIP_START = 12;
// Drawn this far over the picture's top edge in stage px, so no hairline shows between them.
const SKY_STRIP_OVERLAP = 1;
// Spare height smaller than this (screen px) is rounding, not room to fill.
const MIN_SKY_FILL_PX = 0.5;

// The room above the stage, in stage px, when the canvas is taller than the stage; null when there is none.
export const skyFill = (view: View): { x: number; y: number; width: number; height: number } | null => {
  if (view.offsetY < MIN_SKY_FILL_PX) return null;
  const height = view.offsetY / view.scale;
  return { x: 0, y: -height, width: STAGE.width, height };
};

// The background at stage size. Spare width shows a mirrored copy against each side (hills stay upright); spare height
// shows the background's top rows stretched upward, so the sky simply carries on.
const drawBackground = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, view: View): void => {
  const { width, height } = STAGE;
  ctx.drawImage(image, 0, 0, width, height);
  for (const [flip, shift] of [
    [-1, 0],
    [-1, 2 * width],
  ] as const) {
    ctx.save();
    ctx.translate(shift, 0);
    ctx.scale(flip, 1);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
  }
  const sky = skyFill(view);
  if (sky) ctx.drawImage(image, 0, SKY_STRIP_START, image.naturalWidth, SKY_STRIP_ROWS, sky.x, sky.y, sky.width, sky.height + SKY_STRIP_OVERLAP);
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

// Back to front by zone; within a zone, rooted plants stand behind the animals among them.
const drawOrder = (groups: Group[]): Group[] =>
  ZONE_ORDER.flatMap((zone) => [true, false].flatMap((rooted) => groups.filter((group) => group.zone === zone && isRooted(group.role, group.zone) === rooted)));

const drawIndividuals = (ctx: CanvasRenderingContext2D, frame: PlaceFrame, memory: Memory): void => {
  const { layout, poses, seconds } = frame;
  for (const group of drawOrder(layout.groups)) {
    const members = [...(poses.get(group.speciesId) ?? [])].sort((a, b) => a.y - b.y);
    const source = frame.sources[group.speciesId] ?? { kind: 'drawing' };
    const tracked = trackSource(memory, group.speciesId, source, seconds);
    const blend = tracked.previous ? crossfadeBlend(seconds, tracked.since, frame.reducedMotion) : 1;
    const anchor = anchorOf(group, layout.habitat);
    const colour = frame.colours.get(group.speciesId) ?? LABEL_INK;
    // Asking for the travelling pose up front starts it loading before anyone needs it.
    pictureOf(source, 'move', frame, memory);
    for (const pose of members) {
      const file = poseFileFor(group.zone, pose.moving);
      const current = pictureOf(source, file, frame, memory);
      const previous = tracked.previous && blend < 1 ? pictureOf(tracked.previous, file, frame, memory) : null;
      if (previous) drawIndividual(ctx, previous, pose, group, anchor, pose.alpha * (1 - blend), colour);
      if (current) drawIndividual(ctx, current, pose, group, anchor, pose.alpha * (previous ? blend : 1), colour);
    }
    if (source.kind === 'drawing' && members.length > 0) {
      drawName(ctx, group, anchor, frame.web.species.find((entry) => entry.id === group.speciesId)?.name ?? '', colour);
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

const fadeLabels = (memory: Memory, labels: PinnedLabel[], seconds: number, reducedMotion: boolean): void => {
  const elapsed = memory.seconds === null ? 0 : seconds - memory.seconds;
  for (const state of memory.labels.values()) state.present = false;
  for (const label of labels) {
    const key = labelKey(label);
    const state = memory.labels.get(key) ?? { label, alpha: 0, present: true, rect: null, below: false };
    state.present = true;
    memory.labels.set(key, state);
  }
  for (const [key, state] of memory.labels) {
    state.alpha = labelAlpha(state.alpha, state.present, elapsed, reducedMotion);
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
  const view = stageView(width, height);
  const toScreen = (point: Point): Point => ({ x: view.offsetX + point.x * view.scale, y: view.offsetY + point.y * view.scale });

  fadeLabels(memory, frame.labels, frame.seconds, frame.reducedMotion);
  memory.seconds = frame.seconds;
  const extents = layoutLabels(ctx, memory, frame, { width, height }, toScreen);

  ctx.fillStyle = BACKGROUND_FILL;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  const background = frame.images.get(`bg-${frame.layout.habitat}.webp`);
  if (background) drawBackground(ctx, background, view);
  ctx.restore();

  drawLeaders(ctx, extents);

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  drawIndividuals(ctx, frame, memory);
  ctx.restore();

  drawPills(ctx, memory, height);
};
