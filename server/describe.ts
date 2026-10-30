import { checkDescription } from '../src/capture/description';
import { LayoutError } from './sceneWriter';
import type { StubResponse } from './stub';

export type ModelDescribe = (text: string) => Promise<unknown>;
export type ModelDescribeRequest = { text: unknown; reader: string; describe: ModelDescribe };

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({ status, body: { error, details } });

const layoutFailure = (error: LayoutError): StubResponse =>
  failure(error.kind === 'nothing-moves' ? 422 : 502, error.message, error.details);

export const handleDescribeWithModel = async (request: ModelDescribeRequest): Promise<StubResponse> => {
  const checked = checkDescription(request.text);
  if (!checked.ok) return failure(400, checked.error);

  try {
    const scene = await request.describe(checked.text);
    return { status: 200, body: { stub: false, reader: request.reader, scene } };
  } catch (error) {
    if (error instanceof LayoutError) return layoutFailure(error);
    return failure(502, `The scene writer failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const handleDescribeWebWithModel = async (request: ModelDescribeRequest): Promise<StubResponse> => {
  const checked = checkDescription(request.text);
  if (!checked.ok) return failure(400, checked.error);

  try {
    const web = await request.describe(checked.text);
    return { status: 200, body: { stub: false, reader: request.reader, web } };
  } catch (error) {
    if (error instanceof LayoutError) return layoutFailure(error);
    return failure(502, `The food web writer failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
