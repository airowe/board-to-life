import { suggestedWebQuestion } from '../ecosystem/questions';
import { WEB_SAMPLES, webSampleUrl } from '../ecosystem/samples';
import { fittedOrDrawn } from '../geometry/fit';
import { suggestedFocus } from '../geometry/focus';
import { templateFigureQuestion } from '../geometry/questions';
import { figureSampleUrl, GEOMETRY_SAMPLES } from '../geometry/samples';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import type { PredictQuestion } from '../scene/questions';
import { validateScene } from '../scene/schema';
import type { DraftContent, Lesson } from '../session/store';
import type { Subject } from '../subjects';
import { SAMPLES, sampleUrl } from './scenes';

// A sample drawing is drawn from content the app already has, so trying it needs no model call: the reading and the
// questions come with it, and the check screen opens at once. Photos the teacher takes still go to the reader.
export type DemoBoard = { content: DraftContent; questions: Lesson['questions'] };

export const TEST_DRAWING_URL = '/samples/ramp-ball-dominoes.png';

const testDrawing = (): DemoBoard | null => {
  const scene = validateScene(rampBallDominoes);
  return scene.ok ? { content: { subject: 'physics', scene: scene.scene }, questions: structuredClone(rampBallDominoesQuestions) as unknown as PredictQuestion[] } : null;
};

const physicsBoard = (url: string): DemoBoard | null => {
  if (url === TEST_DRAWING_URL) return testDrawing();
  const sample = SAMPLES.find((entry) => sampleUrl(entry.id) === url);
  return sample ? { content: { subject: 'physics', scene: sample.scene }, questions: sample.questions } : null;
};

const webBoard = (url: string): DemoBoard | null => {
  const sample = WEB_SAMPLES.find((entry) => webSampleUrl(entry.id) === url);
  const question = sample && suggestedWebQuestion(sample.web);
  return sample && question ? { content: { subject: 'ecosystem', web: sample.web }, questions: [question] } : null;
};

const figureBoard = (url: string): DemoBoard | null => {
  const sample = GEOMETRY_SAMPLES.find((entry) => figureSampleUrl(entry.id) === url);
  if (!sample) return null;
  const figure = fittedOrDrawn(sample.figure);
  const focus = suggestedFocus(figure);
  return focus ? { content: { subject: 'geometry', figure }, questions: [templateFigureQuestion(figure, focus)] } : null;
};

// The demo board at `url`, read as `subject`, or null when the URL is not one of the samples (or it has nothing to ask).
export const demoBoardFor = (url: string, subject: Subject): DemoBoard | null => {
  const board = subject === 'physics' ? physicsBoard(url) : subject === 'ecosystem' ? webBoard(url) : figureBoard(url);
  return board ? structuredClone(board) : null;
};
