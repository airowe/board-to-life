import { DESCRIPTION_EXAMPLES } from '../capture/examples';
import { SETTLE_SECONDS, STEPS_PER_SECOND, createSimulation, runUntil } from '../physics/simulation';
import type { Scene } from '../scene/schema';

export type LayoutOutcome = {
  fallen: (id: string) => boolean;
  touched: (a: string, b: string) => boolean;
  drop: (id: string) => number;
};

export type DescriptionCase = { text: string; expect: (scene: Scene, outcome: LayoutOutcome) => string[] };

const idsOfKind = (scene: Scene, kind: Scene['items'][number]['kind']): string[] =>
  scene.items.filter((item) => item.kind === kind).map((item) => item.id);

export const dominoesFall =
  (count?: number) =>
  (scene: Scene, { fallen }: LayoutOutcome): string[] => {
    const dominoes = idsOfKind(scene, 'domino');
    const countProblem = count !== undefined && dominoes.length !== count ? [`expected ${count} dominoes, found ${dominoes.length}`] : [];
    return [...countProblem, ...dominoes.filter((id) => !fallen(id)).map((id) => `${id} did not fall`)];
  };

const cartReachesWall = (scene: Scene, { touched }: LayoutOutcome): string[] => {
  const carts = idsOfKind(scene, 'cart');
  const walls = idsOfKind(scene, 'wall');
  if (carts.length === 0) return ['no cart in the scene'];
  if (walls.length === 0) return ['no wall in the scene'];
  return carts.some((cart) => walls.some((wall) => touched(cart, wall))) ? [] : ['the cart never touched a wall'];
};

const heavierBlockSinksAndLighterRises = (scene: Scene, { drop }: LayoutOutcome): string[] => {
  const blocks = scene.items.flatMap((item) => (item.kind === 'block' ? [{ id: item.id, mass: item.mass ?? 0 }] : []));
  const [heavier, lighter] = [...blocks].sort((a, b) => b.mass - a.mass);
  if (!heavier || !lighter || blocks.length !== 2) return [`expected 2 blocks, found ${blocks.length}`];
  if (heavier.mass === lighter.mass) return ['no block was written heavier than the other'];
  return [
    ...(drop(heavier.id) > 0 ? [] : [`${heavier.id} (${heavier.mass} kg) did not end lower than it started`]),
    ...(drop(lighter.id) < 0 ? [] : [`${lighter.id} (${lighter.mass} kg) did not end higher than it started`]),
  ];
};

const THREE_DOMINOES = 3;
const FIVE_DOMINOES = 5;
const example = (index: number): string => {
  const text = DESCRIPTION_EXAMPLES.physics[index];
  if (text === undefined) throw new Error(`no description example ${index}`);
  return text;
};

export const DESCRIPTION_CASES: readonly DescriptionCase[] = [
  { text: example(0), expect: dominoesFall(FIVE_DOMINOES) },
  { text: example(1), expect: cartReachesWall },
  { text: example(2), expect: heavierBlockSinksAndLighterRises },
  { text: example(3), expect: dominoesFall(THREE_DOMINOES) },
  { text: 'Three dominoes stand in a row with a ball rolling toward them from the left.', expect: dominoesFall(THREE_DOMINOES) },
];

export const scoreLayout = (scene: Scene, testCase: DescriptionCase): string[] => {
  const sim = createSimulation(scene);
  const start = new Map(sim.snapshot().map(({ id, y }) => [id, y]));
  runUntil(sim, { kind: 'time', seconds: SETTLE_SECONDS }, SETTLE_SECONDS * STEPS_PER_SECOND);
  const end = new Map(sim.snapshot().map(({ id, y }) => [id, y]));
  return testCase.expect(scene, {
    fallen: (id) => sim.observe({ kind: 'fallen', item: id }),
    touched: (a, b) => sim.isTriggered({ kind: 'contact', a, b }) || sim.isTriggered({ kind: 'contact', a: b, b: a }),
    drop: (id) => (end.get(id) ?? 0) - (start.get(id) ?? 0),
  });
};
