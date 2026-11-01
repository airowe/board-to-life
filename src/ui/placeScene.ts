import type { WebEdits } from '../ecosystem/edits';
import type { Series } from '../ecosystem/model';
import { eventOf } from '../ecosystem/questions';
import type { Role, Web } from '../ecosystem/schema';
import type { LivePictures } from '../library/live';
import type { FallbackEntry, Library } from '../library/manifest';
import { libraryFile } from '../library/match';
import { pictureSource, type PictureSource } from '../library/source';
import { ENTER_SECONDS, LEAVE_SECONDS, STAGGER_FRACTION, createCrowdTracker, crowdTargets, type CrowdTracker } from '../living/crowd';
import { labelsAt, type PinnedLabel } from '../living/labels';
import { layoutPlace } from '../living/layout';
import { toDrawing } from '../present/view';
import { createPlaceImages, drawPlace, FALLBACK_FOLDER, LIBRARY_ROOT, pickPlaceSpecies, stageView, type PlaceFrame } from './placeView';

// Every update restarts the tracker's vigour easing, so a producer's height is re-aimed at most this often while it changes,
// and only once it has moved by more than VIGOUR_EPSILON. Re-aiming every frame would hold it still.
export const VIGOUR_RESEND_SECONDS = 0.75;
export const VIGOUR_EPSILON = 0.02;
// Covers the tracker's producer height easing (1.5 s), which outlasts the label and picture fades.
const EASING_ALLOWANCE_SECONDS = 1.5;
// After a change, how long the scene keeps drawing even with reduced motion: staggered entries, height easing, fades.
export const SETTLE_SECONDS = Math.max(ENTER_SECONDS, LEAVE_SECONDS) * (1 + STAGGER_FRACTION) + EASING_ALLOWANCE_SECONDS;

export type ScenePictures = { library: Library; fallback: FallbackEntry[]; live: LivePictures };

// A picture of the species for an ordinary image element, where the library or the emoji set has one.
export const pictureUrlFor = (name: string, { library, fallback, live }: ScenePictures): string | null => {
  const source = pictureSource(name, library, fallback, live.state);
  if (source.kind === 'emoji') return `${LIBRARY_ROOT}${FALLBACK_FOLDER}${source.file}`;
  if (source.kind !== 'library') return null;
  const file = libraryFile(library, source.subject, 'rest');
  return file ? `${LIBRARY_ROOT}${file}` : null;
};

export type PlaceScene = {
  // Call every frame; it only tells the crowd something when the playback has moved on.
  follow: (series: Series, step: number, edits: WebEdits, seconds: number) => void;
  draw: (canvas: HTMLCanvasElement, seconds: number, reducedMotion: boolean) => void;
  // True while something in the scene is still easing, apart from the idle motion.
  busy: (seconds: number) => boolean;
  // The species shown under a point on the canvas, in canvas px.
  pick: (size: { width: number; height: number }, point: { x: number; y: number }, reachPx: number) => string | null;
  // Marks the scene as just changed, for example when it comes into view.
  wake: () => void;
  dispose: () => void;
};

// `now` is the clock `seconds` are read on (rAF timestamps and performance.now() share it).
export type SceneOptions = { tracker?: CrowdTracker; now?: () => number };

const sameCounts = (a: Record<string, number>, b: Record<string, number>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, count]) => b[id] === count);

const furthestApart = (a: Record<string, number>, b: Record<string, number>): number =>
  Object.entries(a).reduce((most, [id, value]) => Math.max(most, Math.abs(value - (b[id] ?? value))), 0);

export const createPlaceScene = (
  web: Web,
  settled: Record<string, number>,
  colours: () => Map<string, string>,
  pictures: ScenePictures,
  onChange: () => void,
  { tracker = createCrowdTracker(), now = () => performance.now() / 1000 }: SceneOptions = {},
): PlaceScene => {
  const { library, fallback, live } = pictures;
  const layout = layoutPlace(web, library);
  const event = eventOf(web);
  const roles: Record<string, Role> = Object.fromEntries(web.species.map((entry) => [entry.id, entry.role]));
  const producers = web.species.filter((entry) => entry.role === 'producer').map((entry) => entry.id);
  const images = createPlaceImages(onChange);
  const sourcesNow = (): Record<string, PictureSource> =>
    Object.fromEntries(web.species.map((entry) => [entry.id, pictureSource(entry.name, library, fallback, live.state)]));

  let sources = sourcesNow();
  let labels: PinnedLabel[] = [];
  let seen: { series: Series; step: number; edits: WebEdits } | null = null;
  let targets: Record<string, number> | null = null;
  let vigour: Record<string, number> = {};
  let sentVigour: Record<string, number> = {};
  let sentAt = -Infinity;
  let changedAt = -Infinity;

  const unsubscribe = live.onChange(() => {
    try {
      sources = sourcesNow();
      changedAt = now();
      onChange();
    } catch (error) {
      // A picture arriving must never break the lesson; the scene keeps its current pictures.
      console.warn('Could not show a new picture', error);
    }
  });

  const vigourAt = (series: Series, step: number): Record<string, number> =>
    Object.fromEntries(
      producers.map((id) => {
        const values = series.values[id] ?? [];
        const steady = settled[id] ?? 0;
        return [id, steady > 0 ? (values[Math.min(step, values.length - 1)] ?? 0) / steady : 1];
      }),
    );

  const send = (next: Record<string, number>, seconds: number, settle: boolean): void => {
    tracker.update(next, seconds, { settle, vigour });
    targets = next;
    sentVigour = vigour;
    sentAt = seconds;
    changedAt = seconds;
  };

  const follow = (series: Series, step: number, edits: WebEdits, seconds: number): void => {
    if (!seen || seen.series !== series || seen.step !== step || seen.edits !== edits) {
      seen = { series, step, edits };
      changedAt = seconds;
      labels = labelsAt(web, event, series, step);
      vigour = vigourAt(series, step);
      const next = crowdTargets(series, step, settled, roles, edits);
      if (!targets) send(next, seconds, true);
      else if (!sameCounts(next, targets)) send(next, seconds, false);
    }
    if (targets && seconds - sentAt >= VIGOUR_RESEND_SECONDS && furthestApart(vigour, sentVigour) > VIGOUR_EPSILON) send(targets, seconds, false);
  };

  const frame: PlaceFrame = {
    web,
    layout,
    poses: new Map(),
    labels,
    sources,
    images,
    live,
    library,
    colours: colours(),
    seconds: 0,
    reducedMotion: false,
  };

  const draw = (canvas: HTMLCanvasElement, seconds: number, reducedMotion: boolean): void => {
    frame.poses = tracker.poses(layout.groups, seconds, reducedMotion);
    frame.labels = labels;
    frame.sources = sources;
    frame.colours = colours();
    frame.seconds = seconds;
    frame.reducedMotion = reducedMotion;
    drawPlace(canvas, frame);
  };

  return {
    follow,
    draw,
    busy: (seconds) => seconds - changedAt < SETTLE_SECONDS,
    pick: (size, point, reachPx) => {
      const view = stageView(size.width, size.height);
      return pickPlaceSpecies(layout.groups, frame.poses, layout.habitat, toDrawing(view, point), reachPx / view.scale);
    },
    wake: () => {
      changedAt = now();
    },
    dispose: unsubscribe,
  };
};
