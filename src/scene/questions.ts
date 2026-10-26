import { z } from 'zod';
import { BODY_KINDS, type Scene } from './schema';

const questionSchema = z.object({
  id: z.string().min(1),
  predictPointId: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  observe: z.object({ kind: z.literal('fallen'), item: z.string().min(1) }),
  explanation: z.string().min(1),
  cites: z.array(z.string().min(1)).min(1),
});

export type PredictQuestion = z.infer<typeof questionSchema>;
export type GroundingResult = { ok: true; questions: PredictQuestion[] } | { ok: false; errors: string[] };

const mentionsKind = (text: string, kind: string): boolean => new RegExp(`\\b${kind}s?\\b`, 'i').test(text);

const groundingErrors = (question: PredictQuestion, scene: Scene): string[] => {
  const itemIds = new Set(scene.items.map((item) => item.id));
  const presentKinds = new Set<string>(scene.items.map((item) => item.kind));
  const errors: string[] = [];

  for (const cited of question.cites) {
    if (!itemIds.has(cited)) errors.push(`${question.id} cites missing item "${cited}"`);
  }
  if (!itemIds.has(question.observe.item)) {
    errors.push(`${question.id} observes missing item "${question.observe.item}"`);
  }
  if (!scene.predictPoints.some((point) => point.id === question.predictPointId)) {
    errors.push(`${question.id} uses missing predict point "${question.predictPointId}"`);
  }
  for (const kind of BODY_KINDS) {
    if (presentKinds.has(kind)) continue;
    for (const text of [question.prompt, question.explanation]) {
      if (mentionsKind(text, kind)) errors.push(`${question.id} mentions "${kind}" but the scene has none`);
    }
  }
  return errors;
};

export const checkGrounding = (input: unknown, scene: Scene): GroundingResult => {
  const parsed = z.array(questionSchema).safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const errors = parsed.data.flatMap((question) => groundingErrors(question, scene));
  return errors.length === 0 ? { ok: true, questions: parsed.data } : { ok: false, errors };
};
