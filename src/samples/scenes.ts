import { validateScene, type Scene } from "../scene/schema";

// Sample drawings a teacher or judge can try without a whiteboard. Each is drawn from its scene
// (scripts/draw-samples.mjs), so the picture and what the physics does cannot disagree.
export type Sample = {
  id: string;
  title: string;
  scene: Scene;
  // What the class should see happen, checked against the simulation.
  outcome: Outcome;
};

export type Outcome = { falls: string[]; stays: string[]; sinks: string[] };
const outcome = ({
  falls = [],
  stays = [],
  sinks = [],
}: Partial<Outcome>): Outcome => ({ falls, stays, sinks });

export const sampleUrl = (id: string): string => `/samples/${id}.png`;

const checked = (id: string, input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok)
    throw new Error(
      `sample "${id}" has an invalid scene: ${result.errors.join("; ")}`,
    );
  return result.scene;
};

type SceneParts = {
  items: unknown[];
  joints?: unknown[];
  labels?: unknown[];
  unknownMarks?: unknown[];
  predictPoints?: unknown[];
};

const sceneOf = (parts: SceneParts) => ({
  version: 1,
  drawing: { width: 1200, height: 800 },
  joints: [],
  labels: [],
  unknownMarks: [],
  predictPoints: [],
  ...parts,
});

const FLOOR_TOP = 740;
const floor = {
  id: "floor",
  kind: "floor",
  x: 600,
  y: FLOOR_TOP + 30,
  width: 1200,
  height: 60,
  confidence: 0.97,
};
const domino = (id: string, x: number, height = 110, base = FLOOR_TOP) => ({
  id,
  kind: "domino",
  x,
  y: base - height / 2,
  // Thinner than a real domino: the reader tends to draw them thicker, which makes them harder to tip.
  width: Math.round(height / 8),
  height,
  angle: 0,
  confidence: 0.9,
});

const wall = (
  id: string,
  left: number,
  right: number,
  top: number,
  thickness = 30,
) => ({
  id,
  kind: "wall",
  x: (left + right) / 2,
  y: top + thickness / 2,
  width: right - left,
  height: thickness,
  confidence: 0.9,
});
const ball = (id: string, x: number, base: number, radius = 26) => ({
  id,
  kind: "ball",
  x,
  y: base - radius,
  radius,
  confidence: 0.93,
});
const ramp = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
  id,
  kind: "ramp",
  x1,
  y1,
  x2,
  y2,
  thickness: 16,
  confidence: 0.92,
});
const cart = (
  id: string,
  x: number,
  width: number,
  height: number,
  wheelRadius: number,
  base = FLOOR_TOP,
) => ({
  id,
  kind: "cart",
  x,
  y: base - wheelRadius - height / 2,
  width,
  height,
  wheelRadius,
  angle: 0,
  confidence: 0.9,
});
// What the teacher wrote across the top of the board.
const question = (text: string, x = 40) => ({
  id: "question",
  text,
  x,
  y: 60,
  confidence: 0.8,
});
const doodle = (id: string, x: number, y: number, size = 70) => ({
  id,
  x,
  y,
  width: size,
  height: size,
  note: "a doodle",
  confidence: 0.6,
});

// Down the board and back: a ball rolls into a row on the top shelf, which pushes a ball off the end, the ball runs down to
// a second row on the middle shelf, which pushes another ball off the far end, down to a row of
// dominoes on the floor.
const TOP_SHELF = 200;
const MIDDLE_SHELF = 430;
const FLOOR_ROW = [760, 708, 656, 604, 552];
const zigzag = sceneOf({
  items: [
    floor,
    wall("top-shelf", 40, 480, TOP_SHELF),
    ramp("starter", 40, 100, 150, TOP_SHELF - 4),
    ball("ball-1", 62, 100, 32),
    ...[190, 240, 290, 340, 390].map((x, i) =>
      domino(`domino-${i + 1}`, x, 90, TOP_SHELF),
    ),
    ball("ball-2", 460, TOP_SHELF),
    ramp("ramp-1", 500, 260, 740, MIDDLE_SHELF - 4),
    wall("middle-shelf", 720, 1060, MIDDLE_SHELF),
    ...[880, 930, 980].map((x, i) =>
      domino(`domino-${i + 6}`, x, 90, MIDDLE_SHELF),
    ),
    ball("ball-3", 1042, MIDDLE_SHELF),
    ramp("ramp-2", 1170, 490, 860, FLOOR_TOP - 5),
    ...FLOOR_ROW.map((x, i) => domino(`domino-${9 + i}`, x)),
  ],
  labels: [question("Does the last domino fall?", 560)],
  unknownMarks: [doodle("doodle-1", 1080, 170)],
  predictPoints: [
    { id: "pp-1", trigger: { kind: "contact", a: "domino-8", b: "ball-3" } },
  ],
});

// The long ride: a row of dominoes shoves a cart off its shelf, and the cart runs down the long ramp
// and across the floor into the last row.
const RIDE_SHELF = 260;
const longRide = sceneOf({
  items: [
    floor,
    wall("shelf", 40, 460, RIDE_SHELF),
    ramp("starter", 40, 130, 150, RIDE_SHELF - 4),
    ball("ball", 62, 130, 32),
    ...[190, 240, 290].map((x, i) =>
      domino(`domino-${i + 1}`, x, 90, RIDE_SHELF),
    ),
    cart("cart", 390, 120, 44, 18, RIDE_SHELF),
    ramp("ramp", 468, RIDE_SHELF + 28, 770, FLOOR_TOP - 5),
    ...[870, 920, 970, 1020].map((x, i) => domino(`domino-${i + 4}`, x)),
  ],
  labels: [question("How many dominoes fall?", 480)],
  unknownMarks: [doodle("doodle-1", 1000, 200)],
  predictPoints: [
    { id: "pp-1", trigger: { kind: "contact", a: "domino-3", b: "cart" } },
  ],
});

type Slope = { x1: number; y1: number; x2: number; y2: number };
const RAMP_THICKNESS = 16;
const angleOf = ({ x1, y1, x2, y2 }: Slope): number =>
  Math.atan2(y2 - y1, x2 - x1);
// A point `along` a ramp from its first end, lifted `lift` off its top surface.
const onRamp = (slope: Slope, along: number, lift: number) => {
  const angle = angleOf(slope);
  const up = Math.cos(angle) >= 0 ? 1 : -1;
  return {
    x:
      slope.x1 +
      Math.cos(angle) * along +
      up * Math.sin(angle) * (RAMP_THICKNESS / 2 + lift),
    y:
      slope.y1 +
      Math.sin(angle) * along -
      up * Math.cos(angle) * (RAMP_THICKNESS / 2 + lift),
  };
};

// A cart carrying a standing domino rolls down a ramp and hits a kerb. The cart stops; its passenger
// flies on into the row beyond.
const PASSENGER_SLOPE = { x1: 40, y1: 420, x2: 420, y2: FLOOR_TOP - 5 };
const PASSENGER_ANGLE = angleOf(PASSENGER_SLOPE);
const onPassengerSlope = (along: number, lift: number) =>
  onRamp(PASSENGER_SLOPE, along, lift);
const PASSENGER_CART = { width: 150, height: 36, wheels: 18, rider: 120 };
const passenger = sceneOf({
  items: [
    floor,
    ramp(
      "ramp",
      PASSENGER_SLOPE.x1,
      PASSENGER_SLOPE.y1,
      PASSENGER_SLOPE.x2,
      PASSENGER_SLOPE.y2,
    ),
    {
      ...cart(
        "cart",
        0,
        PASSENGER_CART.width,
        PASSENGER_CART.height,
        PASSENGER_CART.wheels,
      ),
      ...onPassengerSlope(
        100,
        PASSENGER_CART.wheels * 2 + PASSENGER_CART.height / 2,
      ),
      angle: PASSENGER_ANGLE,
    },
    {
      ...domino("passenger", 0, PASSENGER_CART.rider),
      width: PASSENGER_CART.rider / 6,
      ...onPassengerSlope(
        100,
        PASSENGER_CART.wheels * 2 +
          PASSENGER_CART.height +
          PASSENGER_CART.rider / 2,
      ),
      angle: PASSENGER_ANGLE,
    },
    {
      id: "kerb",
      kind: "wall",
      x: 720,
      y: FLOOR_TOP - 15,
      width: 30,
      height: 30,
      confidence: 0.9,
    },
    ...[870, 925, 980, 1035].map((x, i) => domino(`domino-${i + 1}`, x)),
  ],
  labels: [question("Where does the passenger end up?")],
  unknownMarks: [doodle("doodle-1", 1050, 180)],
  predictPoints: [
    { id: "pp-1", trigger: { kind: "contact", a: "cart", b: "kerb" } },
  ],
});

// A race down two matching ramps: a cart on one, a block on the other. The block stops short of its
// domino; the cart knocks its row over against the divider.
const RACE_LEFT = { x1: 40, y1: 430, x2: 320, y2: FLOOR_TOP - 5 };
const RACE_RIGHT = { x1: 1160, y1: 430, x2: 880, y2: FLOOR_TOP - 5 };
const RACE_CART = { width: 120, height: 36, wheels: 18 };
const race = sceneOf({
  items: [
    floor,
    ramp("ramp-left", RACE_LEFT.x1, RACE_LEFT.y1, RACE_LEFT.x2, RACE_LEFT.y2),
    ramp(
      "ramp-right",
      RACE_RIGHT.x1,
      RACE_RIGHT.y1,
      RACE_RIGHT.x2,
      RACE_RIGHT.y2,
    ),
    {
      ...cart("cart", 0, RACE_CART.width, RACE_CART.height, RACE_CART.wheels),
      ...onRamp(RACE_LEFT, 80, RACE_CART.wheels * 2 + RACE_CART.height / 2),
      angle: angleOf(RACE_LEFT),
    },
    {
      id: "block",
      kind: "block",
      ...onRamp(RACE_RIGHT, 60, 30),
      width: 60,
      height: 60,
      angle: angleOf(RACE_RIGHT) - Math.PI,
      confidence: 0.9,
    },
    ...[430, 490, 550].map((x, i) => domino(`domino-${i + 1}`, x)),
    {
      id: "divider",
      kind: "wall",
      x: 635,
      y: FLOOR_TOP - 20,
      width: 30,
      height: 40,
      confidence: 0.9,
    },
    domino("domino-4", 700),
  ],
  labels: [question("Which side falls?")],
  unknownMarks: [doodle("doodle-1", 600, 200)],
  predictPoints: [{ id: "pp-1", trigger: { kind: "time", seconds: 0.5 } }],
});

// Each domino is a little taller than the last, from a 50-unit one up to a giant over four times its height.
const GROWING = [50, 62, 78, 98, 122, 150, 180, 215];
const GAPS = [0, 28, 34, 42, 52, 64, 76, 90];
const growingAt = (i: number): number =>
  230 + GAPS.slice(0, i + 1).reduce((sum, gap) => sum + gap, 0);
const growing = sceneOf({
  items: [
    floor,
    ramp("ramp", 30, 580, 170, FLOOR_TOP - 5),
    ball("ball", 55, 580, 22),
    ...GROWING.map((height, i) =>
      domino(`domino-${i + 1}`, growingAt(i), height),
    ),
  ],
  labels: [question("Can a tiny domino knock over a giant?")],
  unknownMarks: [doodle("doodle-1", 1060, 200)],
  predictPoints: [
    { id: "pp-1", trigger: { kind: "contact", a: "domino-6", b: "domino-7" } },
  ],
});

const ids = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${from + i}`);

export const SAMPLES: readonly Sample[] = [
  {
    id: "zigzag",
    title: "Down the board and back",
    scene: checked("zigzag", zigzag),
    outcome: outcome({ falls: ids("domino", 1, 13) }),
  },
  {
    id: "long-ride",
    title: "The long ride",
    scene: checked("long-ride", longRide),
    outcome: outcome({ falls: ids("domino", 1, 7) }),
  },
  {
    id: "passenger",
    title: "The cart stops; the passenger flies",
    scene: checked("passenger", passenger),
    outcome: outcome({ falls: ["passenger", ...ids("domino", 1, 4)] }),
  },
  {
    id: "race",
    title: "Block against cart",
    scene: checked("race", race),
    outcome: outcome({ falls: ids("domino", 1, 3), stays: ["domino-4"] }),
  },
  {
    id: "growing",
    title: "A tiny domino and a giant",
    scene: checked("growing", growing),
    outcome: outcome({ falls: ids("domino", 1, 8) }),
  },
];
