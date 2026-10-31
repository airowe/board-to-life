import type { WebEdits } from '../ecosystem/edits';
import type { Series } from '../ecosystem/model';
import { eventOf } from '../ecosystem/questions';
import type { Role, Web } from '../ecosystem/schema';
import type { LivePictures } from '../library/live';
import type { FallbackEntry, Library } from '../library/manifest';
import { pictureSource, type PictureSource } from '../library/source';
import { ENTER_SECONDS, LEAVE_SECONDS, STAGGER_FRACTION, createCrowdTracker, crowdTargets } from '../living/crowd';
import { labelsAt, type PinnedLabel } from '../living/labels';
import { layoutPlace } from '../living/layout';
import { createPlaceImages, drawPlace, type PlaceFrame } from './placeView';

// Every update restarts the tracker's vigour easing, so a producer's height is re-aimed at most this often while it changes,
// and only once it has moved by more than VIGOUR_EPSILON. Re-aiming every frame would hold it still.
const VIGOUR_RESEND_SECONDS = 0.75;
const VIGOUR_EPSILON = 0.02;
// After a change, how long the scene keeps moving even with reduced motion: staggered entries, label and picture fades.
const SETTLE_SECONDS = Math.max(ENTER_SECONDS, LEAVE_SECONDS) * (1 + STAGGER_FRACTION) + 1.5;

export type ScenePictures = { library: Library; fallback: FallbackEntry[]; live: LivePictures };

export type PlaceScene = {
  // Call every frame; it only tells the crowd something when the playback has moved on.
  follow: (series: Series, step: number, edits: WebEdits, seconds: number) => void;
  draw: (canvas: HTMLCanvasElement, seconds: number, reducedMotion: boolean) => void;
  // True while something in the scene is still easing, apart from the idle motion.
  busy: (seconds: number) => boolean;
  dispose: () => void;
};

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
): PlaceScene => {
  const { library, fallback, live } = pictures;
  const layout = layoutPlace(web, library);
  const event = eventOf(web);
  const roles: Record<string, Role> = Object.fromEntries(web.species.map((entry) => [entry.id, entry.role]));
  const producers = web.species.filter((entry) => entry.role === 'producer').map((entry) => entry.id);
  const tracker = createCrowdTracker();
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
  let lastSeconds = 0;

  const unsubscribe = live.onChange(() => {
    try {
      sources = sourcesNow();
      changedAt = lastSeconds;
      onChange();
    } catch {
      // A picture arriving must never break the lesson; the scene keeps its current pictures.
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

  const frame: PlaceFrame = { web, layout, poses: new Map(), labels, sources, images, live, library, colours: colours(), seconds: 0 };

  const draw = (canvas: HTMLCanvasElement, seconds: number, reducedMotion: boolean): void => {
    frame.poses = tracker.poses(layout.groups, seconds, reducedMotion);
    frame.labels = labels;
    frame.sources = sources;
    frame.colours = colours();
    frame.seconds = seconds;
    lastSeconds = seconds;
    drawPlace(canvas, frame);
  };

  return {
    follow,
    draw,
    busy: (seconds) => seconds - changedAt < SETTLE_SECONDS,
    dispose: unsubscribe,
  };
};
