import Matter from 'matter-js';
import type { Scene, SceneItem, Trigger } from '../scene/schema';

export const STEPS_PER_SECOND = 60;
const STEP_MS = 1000 / STEPS_PER_SECOND;
const FALLEN_RADIANS = Math.PI / 4;

export type BodySnapshot = { id: string; x: number; y: number; angle: number };
export type Observation = { kind: 'fallen'; item: string };

export type Simulation = {
  readonly stepIndex: number;
  step: () => void;
  snapshot: () => BodySnapshot[];
  isTriggered: (trigger: Trigger) => boolean;
  observe: (observation: Observation) => boolean;
};

const { Bodies, Body, Composite, Constraint, Engine, Events } = Matter;

const bodyFor = (item: Exclude<SceneItem, { kind: 'rope' }>): Matter.Body => {
  const label = item.id;
  switch (item.kind) {
    case 'ball':
      return Bodies.circle(item.x, item.y, item.radius, { label, friction: 0.05, frictionAir: 0.001, restitution: 0.1, density: 0.004 });
    case 'block':
    case 'domino':
    case 'lever':
      return Bodies.rectangle(item.x, item.y, item.width, item.height, { label, angle: item.angle, friction: 0.4, density: 0.002 });
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

export const createSimulation = (scene: Scene): Simulation => {
  const engine = Engine.create({ enableSleeping: false });
  const bodies = new Map<string, Matter.Body>();
  for (const item of scene.items) {
    if (item.kind === 'rope') continue;
    const body = bodyFor(item);
    bodies.set(item.id, body);
    Composite.add(engine.world, body);
    if ('velocity' in item && item.velocity) {
      Body.setVelocity(body, { x: item.velocity.x / STEPS_PER_SECOND, y: item.velocity.y / STEPS_PER_SECOND });
    }
  }

  const bodyById = (id: string): Matter.Body => {
    const body = bodies.get(id);
    if (!body) throw new Error(`no body "${id}"`);
    return body;
  };

  for (const item of scene.items) {
    if (item.kind !== 'rope') continue;
    Composite.add(engine.world, Constraint.create({ bodyA: bodyById(item.from), bodyB: bodyById(item.to), length: item.length, stiffness: 0.9 }));
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

  let stepIndex = 0;
  return {
    get stepIndex() {
      return stepIndex;
    },
    step: () => {
      Engine.update(engine, STEP_MS);
      stepIndex += 1;
    },
    snapshot: () =>
      [...bodies].map(([id, body]) => ({ id, x: body.position.x, y: body.position.y, angle: body.angle })),
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
