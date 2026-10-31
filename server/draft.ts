import { NOTHING_TO_PREDICT, changingSpecies, checkWebGrounding, eventOf } from '../src/ecosystem/questions';
import { validateWeb, type Web } from '../src/ecosystem/schema';
import { suggestedFocus } from '../src/geometry/focus';
import { NO_FIGURE_FOCUS, checkFigureGrounding } from '../src/geometry/questions';
import { validateFigure, type Figure, type Focus } from '../src/geometry/schema';
import { checkGrounding } from '../src/scene/questions';
import { validateScene, type Scene } from '../src/scene/schema';
import { outcomesOf } from './questionDrafter';
import type { StubResponse } from './stub';

export type ModelDraft = (scene: Scene) => Promise<unknown>;
export type ModelDraftRequest = { scene: unknown; drafter: string; draft: ModelDraft };

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({ status, body: { error, details } });

export const handleDraftQuestionsWithModel = async (request: ModelDraftRequest): Promise<StubResponse> => {
  const validated = validateScene(request.scene);
  if (!validated.ok) return failure(400, 'The scene sent for drafting failed validation.', validated.errors);
  const scene = validated.scene;
  if (scene.predictPoints.length === 0) {
    return failure(422, 'The reading has no moment to pause at, so there is nothing to ask the class to predict.');
  }
  if (outcomesOf(scene).length === 0) {
    return failure(422, 'The drawing has nothing that can tip over (a domino, block or lever) for the class to predict.');
  }

  let drafted: unknown;
  try {
    drafted = await request.draft(scene);
  } catch (error) {
    return failure(502, `The question drafter failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const grounded = checkGrounding(drafted, scene);
  if (!grounded.ok) return failure(422, 'A drafted question cited something not in the scene.', grounded.errors);
  return { status: 200, body: { stub: false, drafter: request.drafter, questions: grounded.questions } };
};

export type ModelWebDraft = (web: Web) => Promise<unknown>;
export type ModelWebDraftRequest = { web: unknown; drafter: string; draft: ModelWebDraft };

export const handleDraftWebQuestionsWithModel = async (request: ModelWebDraftRequest): Promise<StubResponse> => {
  const validated = validateWeb(request.web);
  if (!validated.ok) return failure(400, 'The web sent for drafting failed validation.', validated.errors);
  const web = validated.web;
  if (changingSpecies(web, eventOf(web)).length === 0) return failure(422, NOTHING_TO_PREDICT);

  let drafted: unknown;
  try {
    drafted = await request.draft(web);
  } catch (error) {
    return failure(502, `The question drafter failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const grounded = checkWebGrounding(drafted, web);
  if (!grounded.ok) return failure(422, 'A drafted question cited something not in the web.', grounded.errors);
  return { status: 200, body: { stub: false, drafter: request.drafter, questions: grounded.questions } };
};

export type ModelFigureDraft = (figure: Figure, focus: Focus) => Promise<unknown>;
export type ModelFigureDraftRequest = { figure: unknown; drafter: string; draft: ModelFigureDraft };

export const handleDraftFigureQuestionsWithModel = async (request: ModelFigureDraftRequest): Promise<StubResponse> => {
  const validated = validateFigure(request.figure);
  if (!validated.ok) return failure(400, 'The figure sent for drafting failed validation.', validated.errors);
  const figure = validated.figure;
  const focus = suggestedFocus(figure);
  if (focus === null) return failure(422, NO_FIGURE_FOCUS);

  let drafted: unknown;
  try {
    drafted = await request.draft(figure, focus);
  } catch (error) {
    return failure(502, `The question drafter failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const grounded = checkFigureGrounding(drafted, figure);
  if (!grounded.ok) return failure(422, 'A drafted question cited something not in the figure.', grounded.errors);
  return { status: 200, body: { stub: false, drafter: request.drafter, questions: grounded.questions } };
};
