import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene } from '../scene/schema';

export type ExpectedOutcome = { item: string; fallen: boolean };

export type Sketch = { svg: string; ghostOf: string | null };

export type DrawingCase = {
  id: string;
  title: string;
  image: string;
  contentType: 'image/png' | 'image/jpeg';
  // How the image is made: sketched from the scene, or (for a photo of a hand-made drawing) taken from photoSource.
  sketch: Sketch | null;
  photo: boolean;
  photoSource: string | null;
  scene: Scene;
  outcomes: ExpectedOutcome[];
};

export const SKETCH_SEED = 11;
// A phone photo after the app's downscale to a 1600 px long edge.
export const PHOTO_SIZE = { width: 1600, height: 1067 };

const checked = (id: string, input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(`drawing case "${id}" has an invalid scene: ${result.errors.join('; ')}`);
  return result.scene;
};

const DRAWINGS = 'src/checks/drawings';

const floor = { id: 'floor', kind: 'floor', x: 600, y: 770, width: 1200, height: 60, confidence: 0.97 };
const domino = (id: string, x: number) => ({ id, kind: 'domino', x, y: 685, width: 18, height: 110, angle: 0, confidence: 0.9 });
const rampWithBall = [
  { id: 'ramp', kind: 'ramp', x1: 60, y1: 330, x2: 470, y2: 728, thickness: 16, confidence: 0.93 },
  { id: 'ball', kind: 'ball', x: 104, y: 330, radius: 30, velocity: { x: 180, y: 0 }, confidence: 0.95 },
];

type SceneParts = { items: unknown[]; joints?: unknown[]; labels?: unknown[]; unknownMarks?: unknown[]; predictPoints?: unknown[] };

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

// On a rope this swing passes about 100 units above the dominoes; the spring stretches into them.
const springSwing = sceneOf({
  items: [
    floor,
    { id: 'pulley', kind: 'pulley', x: 600, y: 200, radius: 14, confidence: 0.88 },
    { id: 'ball', kind: 'ball', x: 900, y: 200, radius: 30, confidence: 0.93 },
    { id: 'spring', kind: 'spring', from: 'pulley', to: 'ball', length: 300, confidence: 0.85 },
    domino('domino-1', 640),
    domino('domino-2', 570),
    domino('domino-3', 500),
  ],
  labels: [{ id: 'label-let-go', text: 'let go', x: 930, y: 160, attachesTo: 'ball', confidence: 0.81 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'domino-1' } }],
});

// The textbook table and hanging weight, with the weight let go out to the side: it swings as it
// falls into a row of dominoes on the floor. Without the rope it drops straight and misses them.
// The row catches it for starts from (960, 360) to (1060, 420), which covers Meta reading the
// weight 30 units further out and lower than drawn.
const tableBlock = { x: 250, y: 370, size: 60 };
const tablePulley = { x: 620, y: 380 };
const hangingWeight = { x: 1000, y: 380, size: 70 };
const tablePulleyScene = sceneOf({
  items: [
    floor,
    { id: 'table', kind: 'wall', x: 350, y: 560, width: 500, height: 320, confidence: 0.9 },
    { id: 'block', kind: 'block', x: tableBlock.x, y: tableBlock.y, width: tableBlock.size, height: tableBlock.size, angle: 0, confidence: 0.9 },
    { id: 'pulley', kind: 'pulley', ...tablePulley, radius: 18, confidence: 0.88 },
    { id: 'weight', kind: 'block', x: hangingWeight.x, y: hangingWeight.y, width: hangingWeight.size, height: hangingWeight.size, angle: 0, confidence: 0.9 },
    domino('domino-1', 740),
    domino('domino-2', 810),
    domino('domino-3', 880),
    {
      id: 'rope',
      kind: 'rope',
      from: 'block',
      to: 'weight',
      over: 'pulley',
      length:
        Math.hypot(tableBlock.x - tablePulley.x, tableBlock.y - tablePulley.y) + Math.hypot(hangingWeight.x - tablePulley.x, hangingWeight.y - tablePulley.y),
      confidence: 0.85,
    },
  ],
  labels: [{ id: 'label-let-go', text: 'let go', x: 960, y: 320, attachesTo: 'weight', confidence: 0.81 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'weight', b: 'domino-3' } }],
});

// A cart rolls on into the dominoes; a block given the same push stops within a few units. It holds
// for pushes from 150 to 200 and a first domino anywhere from 600 to 900.
const cartRoll = sceneOf({
  items: [
    floor,
    { id: 'cart', kind: 'cart', x: 160, y: 690, width: 140, height: 60, wheelRadius: 20, angle: 0, velocity: { x: 180, y: 0 }, confidence: 0.9 },
    domino('domino-1', 700),
    domino('domino-2', 770),
    domino('domino-3', 840),
  ],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'cart', b: 'domino-1' } }],
});

// Two blocks the same size on a seesaw; only the written masses say which side goes down. The
// domino falls for any position from 220 to 300, and never with the masses swapped or left off.
const seesaw = { x: 600, y: 580, half: 340, block: 60 };
const seesawMasses = sceneOf({
  items: [
    floor,
    { id: 'pivot', kind: 'pivot', x: seesaw.x, y: seesaw.y, confidence: 0.9 },
    { id: 'lever', kind: 'lever', x: seesaw.x, y: seesaw.y - 8, width: seesaw.half * 2, height: 16, angle: 0, confidence: 0.9 },
    {
      id: 'left-block',
      kind: 'block',
      x: seesaw.x - seesaw.half + seesaw.block / 2 + 10,
      y: seesaw.y - 16 - seesaw.block / 2,
      width: seesaw.block,
      height: seesaw.block,
      angle: 0,
      mass: 5,
      confidence: 0.9,
    },
    {
      id: 'right-block',
      kind: 'block',
      x: seesaw.x + seesaw.half - seesaw.block / 2 - 10,
      y: seesaw.y - 16 - seesaw.block / 2,
      width: seesaw.block,
      height: seesaw.block,
      angle: 0,
      mass: 1,
      confidence: 0.9,
    },
    domino('domino-1', 260),
  ],
  joints: [{ id: 'pin', kind: 'pin', a: 'lever', b: 'pivot', x: seesaw.x, y: seesaw.y - 8 }],
  labels: [
    { id: 'label-left', text: '5 kg', x: seesaw.x - seesaw.half + 20, y: seesaw.y - 110, attachesTo: 'left-block', confidence: 0.85 },
    { id: 'label-right', text: '1 kg', x: seesaw.x + seesaw.half - 70, y: seesaw.y - 110, attachesTo: 'right-block', confidence: 0.85 },
  ],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'time', seconds: 0.5 } }],
});

const wallInTheWay = sceneOf({
  items: [
    floor,
    ...rampWithBall,
    { id: 'wall', kind: 'wall', x: 560, y: 670, width: 24, height: 140, confidence: 0.9 },
    domino('domino-1', 680),
  ],
  unknownMarks: [{ id: 'mark-1', x: 860, y: 420, width: 90, height: 90, note: 'Unrecognised spiral doodle', confidence: 0.27 }],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'wall' } }],
});

type CleanCase = Pick<DrawingCase, 'id' | 'title' | 'scene' | 'outcomes'> & { handDrawn: string | null };

const CLEAN_CASES: readonly CleanCase[] = [
  {
    id: 'ramp-ball-dominoes',
    title: 'Ball down a ramp into five dominoes',
    handDrawn: 'public/samples/ramp-ball-dominoes.png',
    scene: checked('ramp-ball-dominoes', rampBallDominoes),
    outcomes: [{ item: 'domino-5', fallen: true }],
  },
  {
    id: 'dominoes-wide-gap',
    title: 'The same row with a gap too wide to cross',
    handDrawn: null,
    scene: checked('dominoes-wide-gap', dominoesWideGap),
    outcomes: [
      { item: 'domino-3', fallen: true },
      { item: 'domino-5', fallen: false },
    ],
  },
  {
    id: 'pendulum-knock',
    title: 'A ball on a rope swings into three dominoes',
    handDrawn: null,
    scene: checked('pendulum-knock', pendulumKnock),
    outcomes: [{ item: 'domino-3', fallen: true }],
  },
  {
    id: 'spring-swing',
    title: 'A ball on a spring stretches down into three dominoes',
    handDrawn: null,
    scene: checked('spring-swing', springSwing),
    outcomes: [{ item: 'domino-3', fallen: true }],
  },
  {
    id: 'table-pulley',
    title: 'A weight on a rope over a pulley swings into a row of dominoes as it falls',
    handDrawn: null,
    scene: checked('table-pulley', tablePulleyScene),
    outcomes: [{ item: 'domino-1', fallen: true }],
  },
  {
    id: 'cart-roll',
    title: 'A pushed cart rolls into three dominoes',
    handDrawn: null,
    scene: checked('cart-roll', cartRoll),
    outcomes: [{ item: 'domino-3', fallen: true }],
  },
  {
    id: 'seesaw-masses',
    title: 'Two blocks the same size on a seesaw, labelled 5 kg and 1 kg',
    handDrawn: null,
    scene: checked('seesaw-masses', seesawMasses),
    outcomes: [{ item: 'domino-1', fallen: true }],
  },
  {
    id: 'wall-in-the-way',
    title: 'A short wall stops the ball before the domino',
    handDrawn: null,
    scene: checked('wall-in-the-way', wallInTheWay),
    outcomes: [{ item: 'domino-1', fallen: false }],
  },
];

const asDrawn = ({ handDrawn, ...rest }: CleanCase): DrawingCase => ({
  ...rest,
  image: handDrawn ?? `${DRAWINGS}/${rest.id}.png`,
  contentType: 'image/png',
  sketch: handDrawn ? null : { svg: `${DRAWINGS}/${rest.id}.svg`, ghostOf: null },
  photo: false,
  photoSource: null,
});

// The photo of each drawing has old, half-erased strokes of the next drawing under it.
const asPhoto = ({ handDrawn, ...rest }: CleanCase, index: number): DrawingCase => {
  const id = `${rest.id}-photo`;
  const ghost = CLEAN_CASES[(index + 1) % CLEAN_CASES.length]?.id ?? null;
  return {
    ...rest,
    id,
    title: `${rest.title} (photo)`,
    image: `${DRAWINGS}/${id}.jpg`,
    contentType: 'image/jpeg',
    sketch: handDrawn ? null : { svg: `${DRAWINGS}/${id}.svg`, ghostOf: ghost },
    photo: true,
    photoSource: handDrawn,
  };
};

export const DRAWING_CASES: readonly DrawingCase[] = [...CLEAN_CASES.map(asDrawn), ...CLEAN_CASES.map(asPhoto)];
