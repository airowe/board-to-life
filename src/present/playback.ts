import { STEPS_PER_SECOND, createSimulation, type Simulation } from '../physics/simulation';
import type { PredictQuestion } from '../scene/questions';
import type { Scene } from '../scene/schema';
import type { PhysicsLesson } from '../session/store';
import { createTrailRecorder, type Trail, type TrailRecorder } from './trails';

export type Result = { question: PredictQuestion; happened: boolean };
export type Phase =
  | { kind: 'ready' }
  | { kind: 'running' }
  | { kind: 'predict'; question: PredictQuestion }
  | { kind: 'done'; results: Result[] };

export type Playback = {
  phase: () => Phase;
  stepIndex: () => number;
  simulation: () => Simulation;
  scene: () => Scene;
  trails: () => Trail[];
  play: () => void;
  tick: (maxSteps: number) => void;
  reveal: () => void;
  // Starts again from the beginning, with a setup the students changed when one is given.
  replay: (scene?: Scene) => void;
};

// Drawing units: trail points closer than this are dropped, and a body that never strays this far leaves no trail.
const TRAIL_GAP = 4;
const TRAIL_MIN_TRAVEL = 12;

export const createPlayback = (lesson: PhysicsLesson, settleSeconds: number): Playback => {
  const settleSteps = Math.round(settleSeconds * STEPS_PER_SECOND);
  let scene = lesson.scene;
  const triggerFor = (question: PredictQuestion) =>
    scene.predictPoints.find((point) => point.id === question.predictPointId)?.trigger;

  let sim: Simulation;
  let recorder: TrailRecorder;
  let pending: PredictQuestion[];
  let phase: Phase;
  const reset = (): void => {
    sim = createSimulation(scene);
    recorder = createTrailRecorder(TRAIL_GAP);
    recorder.record(sim.snapshot());
    pending = [...lesson.questions];
    phase = { kind: 'ready' };
  };
  reset();

  const nextDue = (): PredictQuestion | undefined =>
    pending.find((question) => {
      const trigger = triggerFor(question);
      return trigger !== undefined && sim.isTriggered(trigger);
    });

  const pauseIfDue = (): boolean => {
    const due = nextDue();
    if (!due) return false;
    pending = pending.filter((question) => question !== due);
    phase = { kind: 'predict', question: due };
    return true;
  };

  const finish = (): void => {
    phase = {
      kind: 'done',
      results: lesson.questions.map((question) => ({ question, happened: sim.observe(question.observe) })),
    };
  };

  return {
    phase: () => phase,
    stepIndex: () => sim.stepIndex,
    simulation: () => sim,
    scene: () => scene,
    trails: () => recorder.trails(TRAIL_MIN_TRAVEL),
    play: () => {
      if (phase.kind !== 'ready') return;
      phase = { kind: 'running' };
      pauseIfDue();
    },
    tick: (maxSteps) => {
      for (let i = 0; i < maxSteps && phase.kind === 'running'; i += 1) {
        if (sim.stepIndex >= settleSteps) {
          finish();
          return;
        }
        sim.step();
        recorder.record(sim.snapshot());
        pauseIfDue();
      }
    },
    reveal: () => {
      if (phase.kind !== 'predict') return;
      phase = { kind: 'running' };
      pauseIfDue();
    },
    replay: (next = scene) => {
      scene = next;
      reset();
    },
  };
};
