import Matter from 'matter-js';
import { cartWheels } from '../scene/cart';
import { isLink, type Body as SceneBody, type Link, type Scene, type Trigger } from '../scene/schema';

export const STEPS_PER_SECOND = 60;
// Long enough for every check drawing to come to rest.
export const SETTLE_SECONDS = 7;
const DEFAULT_SUBSTEPS = 4;
// Drawing units are roughly millimetres on the board, so gravity is scaled up
// from Matter's default; at the default the domino chain creeps at its friction
// limit and the outcome depends on the timestep.
const GRAVITY_SCALE = 0.006;
const FALLEN_RADIANS = Math.PI / 4;
const ROPE_STIFFNESS = 0.9;
// Soft enough that a ball visibly stretches a spring and bounces on it.
const SPRING_STIFFNESS = 0.004;
const SPRING_DAMPING = 0.01;
// Matter.js loses a lot of energy on rolling contact under our strong gravity (a pushed ball stops
// within about 200 units), so wheels glide without friction instead: an ideal wheel.
const WHEEL_FRICTION = 0;
const DOMINO_ROUNDING = 3;
// A written "1 kg" weighs about as much as a domino drawn at the usual size.
const MASS_PER_KG = 4;

export type BodySnapshot = { id: string; x: number; y: number; angle: number };
export type Observation = { kind: 'fallen'; item: string };

export type Simulation = {
  readonly stepIndex: number;
  step: () => void;
  snapshot: () => BodySnapshot[];
  previousSnapshot: () => BodySnapshot[];
  isTriggered: (trigger: Trigger) => boolean;
  observe: (observation: Observation) => boolean;
};

const { Bodies, Body, Composite, Constraint, Engine, Events } = Matter;

const bodyFor = (item: SceneBody): Matter.Body => {
  const label = item.id;
  switch (item.kind) {
    case 'ball':
      return Bodies.circle(item.x, item.y, item.radius, { label, friction: 0.05, frictionAir: 0.001, restitution: 0.1, density: 0.0015 });
    // Rounded edges, like a real domino. With square ones, a domino read even a few units too wide
    // was shoved along the floor by a flat push instead of tipping over.
    case 'domino':
      return Bodies.rectangle(item.x, item.y, item.width, item.height, { label, angle: item.angle, friction: 0.6, density: 0.002, chamfer: { radius: DOMINO_ROUNDING } });
    case 'block':
    case 'lever':
      return Bodies.rectangle(item.x, item.y, item.width, item.height, { label, angle: item.angle, friction: 0.6, density: 0.002 });
    case 'cart':
      return Bodies.rectangle(item.x, item.y, item.width, item.height, { label, angle: item.angle, friction: 0.6, frictionAir: 0.001, density: 0.002 });
    case 'ramp': {
      const length = Math.hypot(item.x2 - item.x1, item.y2 - item.y1);
      const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      return Bodies.rectangle((item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2, length, item.thickness, {
        label,
        angle,
        isStatic: true,
        friction: 0.05,
      });
    }
    case 'wall':
    case 'floor':
      return Bodies.rectangle(item.x, item.y, item.width, item.height, { label, isStatic: true, friction: 0.6 });
    case 'pivot':
      return Bodies.circle(item.x, item.y, 6, { label, isStatic: true, isSensor: true });
    case 'pulley':
      return Bodies.circle(item.x, item.y, item.radius, { label, isStatic: true });
  }
};

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');

type Vector = { x: number; y: number };
const minus = (a: Vector, b: Vector): Vector => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y;
const unit = (v: Vector): Vector => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};

// A rope over a pulley: the two sides together are never longer than the rope, and it only
// pulls. Matter.js has no such constraint, so it is enforced after every substep: the ends are
// moved back toward the pulley in proportion to how light they are, and any speed that would
// lengthen the rope is taken out as an impulse shared the same way.
const holdRopeOverPulley = (a: Matter.Body, b: Matter.Body, wheel: Vector, length: number): void => {
  const [toA, toB] = [unit(minus(a.position, wheel)), unit(minus(b.position, wheel))];
  const [weightA, weightB] = [a.isStatic ? 0 : a.inverseMass, b.isStatic ? 0 : b.inverseMass];
  const total = weightA + weightB;
  if (total === 0) return;
  const used = Math.hypot(a.position.x - wheel.x, a.position.y - wheel.y) + Math.hypot(b.position.x - wheel.x, b.position.y - wheel.y);
  if (used <= length) return;
  const excess = used - length;
  const pull = (body: Matter.Body, direction: Vector, weight: number, amount: number): void => {
    if (weight === 0) return;
    Body.setPosition(body, { x: body.position.x - direction.x * amount * (weight / total), y: body.position.y - direction.y * amount * (weight / total) });
  };
  pull(a, toA, weightA, excess);
  pull(b, toB, weightB, excess);
  const lengthening = dot(a.velocity, toA) + dot(b.velocity, toB);
  if (lengthening <= 0) return;
  const impulse = lengthening / total;
  if (weightA > 0) Body.setVelocity(a, { x: a.velocity.x - toA.x * impulse * weightA, y: a.velocity.y - toA.y * impulse * weightA });
  if (weightB > 0) Body.setVelocity(b, { x: b.velocity.x - toB.x * impulse * weightB, y: b.velocity.y - toB.y * impulse * weightB });
};

export type SimulationOptions = { substeps?: number };

export const createSimulation = (scene: Scene, { substeps = DEFAULT_SUBSTEPS }: SimulationOptions = {}): Simulation => {
  const substepMs = 1000 / STEPS_PER_SECOND / substeps;
  const engine = Engine.create({ enableSleeping: false, gravity: { x: 0, y: 1, scale: GRAVITY_SCALE } });
  const bodies = new Map<string, Matter.Body>();
  for (const item of scene.items) {
    if (isLink(item)) continue;
    const body = bodyFor(item);
    if ('mass' in item && item.mass !== undefined) Body.setMass(body, item.mass * MASS_PER_KG);
    bodies.set(item.id, body);
    Composite.add(engine.world, body);
    if ('velocity' in item && item.velocity) {
      Body.setVelocity(body, { x: item.velocity.x / STEPS_PER_SECOND, y: item.velocity.y / STEPS_PER_SECOND });
    }
  }

  // A cart's wheels share its label, so a wheel touching something counts as the cart touching it.
  for (const item of scene.items) {
    if (item.kind !== 'cart') continue;
    const cart = bodies.get(item.id);
    if (!cart) continue;
    const group = Body.nextGroup(true);
    cart.collisionFilter.group = group;
    for (const centre of cartWheels(item)) {
      const wheel = Bodies.circle(centre.x, centre.y, item.wheelRadius, {
        label: item.id,
        friction: WHEEL_FRICTION,
        frictionStatic: WHEEL_FRICTION,
        frictionAir: 0.001,
        density: 0.002,
        collisionFilter: { group },
      });
      if (item.velocity) Body.setVelocity(wheel, { x: item.velocity.x / STEPS_PER_SECOND, y: item.velocity.y / STEPS_PER_SECOND });
      Composite.add(engine.world, [wheel, Constraint.create({ bodyA: cart, pointA: { x: centre.x - item.x, y: centre.y - item.y }, bodyB: wheel, length: 0, stiffness: 1 })]);
    }
  }

  const bodyById = (id: string): Matter.Body => {
    const body = bodies.get(id);
    if (!body) throw new Error(`no body "${id}"`);
    return body;
  };

  const overPulley = (item: Link): item is Extract<Link, { kind: 'rope' }> & { over: string } => item.kind === 'rope' && item.over !== undefined;
  const wrapped = scene.items.filter(isLink).filter(overPulley);
  for (const item of scene.items.filter(isLink)) {
    if (overPulley(item)) continue;
    const spring = item.kind === 'spring';
    Composite.add(
      engine.world,
      Constraint.create({
        bodyA: bodyById(item.from),
        bodyB: bodyById(item.to),
        length: item.length,
        stiffness: spring ? SPRING_STIFFNESS : ROPE_STIFFNESS,
        damping: spring ? SPRING_DAMPING : 0,
      }),
    );
  }
  for (const joint of scene.joints) {
    const a = bodyById(joint.a);
    const b = bodyById(joint.b);
    Composite.add(
      engine.world,
      Constraint.create({
        bodyA: a,
        pointA: { x: joint.x - a.position.x, y: joint.y - a.position.y },
        bodyB: b,
        pointB: { x: joint.x - b.position.x, y: joint.y - b.position.y },
        length: 0,
        stiffness: 1,
      }),
    );
  }

  const initialAngles = new Map([...bodies].map(([id, body]) => [id, body.angle]));
  const contacts = new Set<string>();
  Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) contacts.add(pairKey(pair.bodyA.label, pair.bodyB.label));
  });

  const snapshot = (): BodySnapshot[] =>
    [...bodies].map(([id, body]) => ({ id, x: body.position.x, y: body.position.y, angle: body.angle }));

  let stepIndex = 0;
  let previous = snapshot();
  return {
    get stepIndex() {
      return stepIndex;
    },
    step: () => {
      previous = snapshot();
      for (let i = 0; i < substeps; i += 1) {
        Engine.update(engine, substepMs);
        for (const rope of wrapped) holdRopeOverPulley(bodyById(rope.from), bodyById(rope.to), bodyById(rope.over).position, rope.length);
      }
      stepIndex += 1;
    },
    snapshot,
    previousSnapshot: () => previous,
    isTriggered: (trigger) =>
      trigger.kind === 'time'
        ? stepIndex >= Math.round(trigger.seconds * STEPS_PER_SECOND)
        : contacts.has(pairKey(trigger.a, trigger.b)),
    observe: (observation) =>
      Math.abs(bodyById(observation.item).angle - (initialAngles.get(observation.item) ?? 0)) > FALLEN_RADIANS,
  };
};

export const runUntil = (sim: Simulation, trigger: Trigger, maxSteps: number): number | null => {
  while (!sim.isTriggered(trigger)) {
    if (sim.stepIndex >= maxSteps) return null;
    sim.step();
  }
  return sim.stepIndex;
};
