import { STEPS_PER_SECOND, createSimulation, type Simulation } from '../physics/simulation';
import type { PredictQuestion } from '../scene/questions';
import type { Lesson } from '../session/store';

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
  play: () => void;
  tick: (maxSteps: number) => void;
  reveal: () => void;
  replay: () => void;
};

export const createPlayback = (lesson: Lesson, settleSeconds: number): Playback => {
  const settleSteps = Math.round(settleSeconds * STEPS_PER_SECOND);
  const triggerFor = (question: PredictQuestion) =>
    lesson.scene.predictPoints.find((point) => point.id === question.predictPointId)?.trigger;

  let sim = createSimulation(lesson.scene);
  let pending = [...lesson.questions];
  let phase: Phase = { kind: 'ready' };

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
        pauseIfDue();
      }
    },
    reveal: () => {
      if (phase.kind !== 'predict') return;
      phase = { kind: 'running' };
      pauseIfDue();
    },
    replay: () => {
      sim = createSimulation(lesson.scene);
      pending = [...lesson.questions];
      phase = { kind: 'ready' };
    },
  };
};
