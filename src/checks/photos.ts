import { isLink, type BodyKind, type Scene, type SceneItem } from '../scene/schema';

// Real photos have no hand-made scene with exact positions, so they are checked on what the drawing
// fixes: how many of each thing there are, what happens to items picked by where they stand, and
// whether a doodle is flagged rather than turned into physics.
export type ItemPick = { kind: BodyKind; from: 'left' | 'right'; place: number };
export type PhotoCheck = {
  name: string;
  title: string;
  counts: Partial<Record<BodyKind, number>>;
  outcomes: (ItemPick & { fallen: boolean })[];
  doodles?: number;
};
export type PhotoScore = {
  counts: { kind: BodyKind; expected: number; actual: number }[];
  outcomes: { label: string; item: string | null; expected: boolean; actual: boolean | null }[];
  doodles: { expected: number; actual: number } | null;
  passed: boolean;
};
export type PhotoResult = { name: string; title: string; score: PhotoScore | null; error: string | null };

const chainCounts = { floor: 1, ramp: 1, ball: 1, domino: 5 };
const lastDominoFalls = { kind: 'domino', from: 'right', place: 1, fallen: true } as const;

// One per drawing in check-photos/SHOT-LIST.md.
export const PHOTO_CHECKS: readonly PhotoCheck[] = [
  { name: '01-chain', title: 'Ramp, ball and five dominoes', counts: chainCounts, outcomes: [lastDominoFalls] },
  { name: '01-chain-angle', title: 'The same chain, photographed at an angle', counts: chainCounts, outcomes: [lastDominoFalls] },
  {
    name: '02-gap',
    title: 'A gap too wide before the fourth domino',
    counts: chainCounts,
    outcomes: [
      { kind: 'domino', from: 'left', place: 3, fallen: true },
      { kind: 'domino', from: 'left', place: 4, fallen: false },
    ],
  },
  {
    name: '03-wall',
    title: 'A hatched wall stops the ball',
    counts: { floor: 1, ramp: 1, ball: 1, wall: 1, domino: 1 },
    outcomes: [{ kind: 'domino', from: 'left', place: 1, fallen: false }],
  },
  {
    name: '04-pendulum',
    title: 'A ball on a rope swings into three dominoes',
    counts: { floor: 1, pulley: 1, rope: 1, ball: 1, domino: 3 },
    outcomes: [lastDominoFalls],
  },
  { name: '05-messy', title: 'The chain with a doodle and a smudge', counts: chainCounts, outcomes: [lastDominoFalls], doodles: 1 },
  {
    name: '06-spring',
    title: 'A ball on a spring stretches down into three dominoes',
    counts: { floor: 1, pulley: 1, spring: 1, ball: 1, domino: 3 },
    outcomes: [{ kind: 'domino', from: 'left', place: 1, fallen: true }],
  },
  {
    name: '07-pulley',
    title: 'A weight on a rope over a pulley swings into dominoes',
    counts: { floor: 1, wall: 1, pulley: 1, rope: 1, block: 2, domino: 3 },
    outcomes: [{ kind: 'domino', from: 'left', place: 1, fallen: true }],
  },
  { name: '08-cart', title: 'A pushed cart rolls into three dominoes', counts: { floor: 1, cart: 1, domino: 3 }, outcomes: [lastDominoFalls] },
  {
    name: '09-seesaw',
    title: 'A seesaw with 5 kg and 1 kg blocks the same size',
    counts: { floor: 1, pivot: 1, lever: 1, block: 2, domino: 1 },
    outcomes: [{ kind: 'domino', from: 'left', place: 1, fallen: true }],
  },
];

const centreX = (item: SceneItem): number | null => {
  if (isLink(item)) return null;
  return item.kind === 'ramp' ? (item.x1 + item.x2) / 2 : item.x;
};

export const pickItem = (scene: Scene, pick: ItemPick): string | null => {
  const placed = scene.items
    .flatMap((item) => {
      const x = centreX(item);
      return item.kind === pick.kind && x !== null ? [{ id: item.id, x }] : [];
    })
    .sort((a, b) => (pick.from === 'left' ? a.x - b.x : b.x - a.x));
  return placed[pick.place - 1]?.id ?? null;
};

const ordinal = (place: number): string => `${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`;
const describePick = (pick: ItemPick): string => `${pick.kind} ${ordinal(pick.place)} from the ${pick.from}`;

export const scorePhoto = (check: PhotoCheck, scene: Scene, fallen: Map<string, boolean>): PhotoScore => {
  const counts = Object.entries(check.counts).map(([kind, expected]) => ({
    kind: kind as BodyKind,
    expected,
    actual: scene.items.filter((item) => item.kind === kind).length,
  }));
  const outcomes = check.outcomes.map((outcome) => {
    const item = pickItem(scene, outcome);
    return { label: describePick(outcome), item, expected: outcome.fallen, actual: item === null ? null : (fallen.get(item) ?? null) };
  });
  const doodles = check.doodles === undefined ? null : { expected: check.doodles, actual: scene.unknownMarks.length };
  const passed =
    counts.every((count) => count.actual === count.expected) &&
    outcomes.every((outcome) => outcome.actual === outcome.expected) &&
    (doodles === null || doodles.actual >= doodles.expected);
  return { counts, outcomes, doodles, passed };
};

const describeFall = (fallen: boolean | null): string => (fallen === null ? 'not read' : fallen ? 'falls' : 'stays up');

const scoreDetails = (score: PhotoScore): string[] => [
  ...score.counts.filter((count) => count.actual !== count.expected).map((count) => `${count.kind}: expected ${count.expected}, read ${count.actual}`),
  ...score.outcomes.map(
    (outcome) =>
      `${outcome.label} (${outcome.item ?? 'not found'}): expected ${describeFall(outcome.expected)}, read scene ${describeFall(outcome.actual)} (${outcome.actual === outcome.expected ? 'ok' : 'WRONG'})`,
  ),
  ...(score.doodles ? [`doodles flagged: ${score.doodles.actual} of ${score.doodles.expected}`] : []),
];

export const formatPhotoReport = (results: PhotoResult[]): string => {
  const width = Math.max(...results.map((result) => result.name.length));
  const passed = results.filter((result) => result.score?.passed).length;
  const lines = results.flatMap((result) => [
    `${result.name.padEnd(width)}  ${result.score?.passed ? 'PASS' : 'FAIL'}  ${result.title}`,
    ...(result.error ? [result.error] : result.score ? scoreDetails(result.score) : []).map((detail) => `${' '.repeat(width + 2)}${detail}`),
  ]);
  return [...lines, '', `${passed} of ${results.length} photos read correctly`].join('\n');
};
