import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene } from '../scene/schema';

export type ExpectedOutcome = { item: string; fallen: boolean };

export type DrawingCase = {
  id: string;
  title: string;
  image: string;
  sketched: boolean;
  scene: Scene;
  outcomes: ExpectedOutcome[];
};

export const SKETCH_SEED = 11;

const checked = (id: string, input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(`drawing case "${id}" has an invalid scene: ${result.errors.join('; ')}`);
  return result.scene;
};

const sketchedImage = (id: string): string => `src/checks/drawings/${id}.png`;

const floor = { id: 'floor', kind: 'floor', x: 600, y: 770, width: 1200, height: 60, confidence: 0.97 };
const domino = (id: string, x: number) => ({ id, kind: 'domino', x, y: 685, width: 18, height: 110, angle: 0, confidence: 0.9 });
const rampWithBall = [
  { id: 'ramp', kind: 'ramp', x1: 60, y1: 330, x2: 470, y2: 728, thickness: 16, confidence: 0.93 },
  { id: 'ball', kind: 'ball', x: 104, y: 330, radius: 30, velocity: { x: 180, y: 0 }, confidence: 0.95 },
];

type SceneParts = { items: unknown[]; labels?: unknown[]; unknownMarks?: unknown[]; predictPoints?: unknown[] };

const sceneOf = (parts: SceneParts) => ({
  version: 1,
  drawing: { width: 1200, height: 800 },
  joints: [],
  labels: [],
  unknownMarks: [],
  predictPoints: [],
  ...parts,
});

const dominoesWideGap = sceneOf({
  items: [floor, ...rampWithBall, domino('domino-1', 640), domino('domino-2', 712), domino('domino-3', 784), domino('domino-4', 1000), domino('domino-5', 1072)],
  labels: [{ id: 'label-gap', text: 'gap', x: 860, y: 590, confidence: 0.8 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'domino-1' } }],
});

const pendulumKnock = sceneOf({
  items: [
    floor,
    { id: 'pulley', kind: 'pulley', x: 330, y: 280, radius: 14, confidence: 0.88 },
    { id: 'ball', kind: 'ball', x: 700, y: 280, radius: 30, confidence: 0.93 },
    { id: 'rope', kind: 'rope', from: 'pulley', to: 'ball', length: 370, confidence: 0.85 },
    domino('domino-1', 290),
    domino('domino-2', 220),
    domino('domino-3', 150),
  ],
  labels: [{ id: 'label-let-go', text: 'let go', x: 730, y: 240, attachesTo: 'ball', confidence: 0.81 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'domino-1' } }],
});

const wallInTheWay = sceneOf({
  items: [
    floor,
    ...rampWithBall,
    { id: 'wall', kind: 'wall', x: 560, y: 670, width: 24, height: 140, confidence: 0.9 },
    domino('domino-1', 680),
  ],
  unknownMarks: [{ id: 'mark-1', x: 860, y: 420, width: 90, height: 90, note: 'Unrecognised zigzag (maybe a spring)', confidence: 0.27 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'wall' } }],
});

export const DRAWING_CASES: readonly DrawingCase[] = [
  {
    id: 'ramp-ball-dominoes',
    title: 'Ball down a ramp into five dominoes',
    image: 'public/samples/ramp-ball-dominoes.png',
    sketched: false,
    scene: checked('ramp-ball-dominoes', rampBallDominoes),
    outcomes: [{ item: 'domino-5', fallen: true }],
  },
  {
    id: 'dominoes-wide-gap',
    title: 'The same row with a gap too wide to cross',
    image: sketchedImage('dominoes-wide-gap'),
    sketched: true,
    scene: checked('dominoes-wide-gap', dominoesWideGap),
    outcomes: [
      { item: 'domino-3', fallen: true },
      { item: 'domino-5', fallen: false },
    ],
  },
  {
    id: 'pendulum-knock',
    title: 'A ball on a rope swings into three dominoes',
    image: sketchedImage('pendulum-knock'),
    sketched: true,
    scene: checked('pendulum-knock', pendulumKnock),
    outcomes: [{ item: 'domino-3', fallen: true }],
  },
  {
    id: 'wall-in-the-way',
    title: 'A short wall stops the ball before the domino',
    image: sketchedImage('wall-in-the-way'),
    sketched: true,
    scene: checked('wall-in-the-way', wallInTheWay),
    outcomes: [{ item: 'domino-1', fallen: false }],
  },
];
