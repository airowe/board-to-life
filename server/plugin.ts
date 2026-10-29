import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ACCESS_HEADER } from '../src/access';
import { hasAccess } from './access';
import { MODEL_REQUEST_TIMEOUT_MS } from '../src/reading';
import { isProviderName, parseEffort, providerFromEnv, readSceneWithModel } from './sceneReader';
import { handleDraftQuestions, handleUnderstand, parseStubMode, type StubMode, type StubResponse } from './stub';
import { handleDraftQuestionsWithModel, type ModelDraft } from './draft';
import { draftQuestionsWithModel } from './questionDrafter';
import { handleUnderstandWithModel, type ModelRead } from './understand';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const STUB_LATENCY_MS = 700;
export const STUB_TIMEOUT_DELAY_MS = MODEL_REQUEST_TIMEOUT_MS + 15_000;
// The whole budget for one read or draft, a retry included: the slowest read measured took 71 s.
export const MODEL_TIMEOUT_MS = 120_000;

const delayFor = (mode: StubMode): number => (mode === 'timeout' ? STUB_TIMEOUT_DELAY_MS : STUB_LATENCY_MS);

const readBody = (request: IncomingMessage): Promise<Buffer | null> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

const send = (response: ServerResponse, { status, body }: StubResponse): void => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

const parseJson = (buffer: Buffer): unknown => {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
};

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

type ApiOptions = { env: Record<string, string | undefined> };

// SCENE_READER=meta or baseten sends photos and question drafts to that model (paid); anything else keeps the stub.
const modelFrom = (env: ApiOptions['env']): { name: string; read: ModelRead; draft: ModelDraft } | null => {
  const name = env.SCENE_READER ?? 'stub';
  if (!isProviderName(name)) return null;
  const provider = providerFromEnv(name, env);
  const effort = parseEffort(env.READER_EFFORT);
  const options = { timeoutMs: MODEL_TIMEOUT_MS, ...(effort ? { effort } : {}) };
  return {
    name,
    read: (photo) => readSceneWithModel(photo, provider, options),
    draft: (scene) => draftQuestionsWithModel(scene, provider, options),
  };
};

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;

const NO_ACCESS = 'This demo needs its access link. Open the link from the submission page, then take the photo again.';

// The API routes as plain Node middleware, so the dev server and the deployed functions share them.
export const apiMiddleware = ({ env }: ApiOptions, model = modelFrom(env)): Middleware => async (request, response, next) => {
  const route = request.url?.split('?')[0];
  if (request.method !== 'POST' || (route !== '/api/understand' && route !== '/api/draft-questions')) {
    next();
    return;
  }
  if (!hasAccess(env.ACCESS_CODE, header(request, ACCESS_HEADER))) {
    send(response, { status: 401, body: { error: NO_ACCESS, details: [] } });
    return;
  }
  const mode = parseStubMode(header(request, 'x-stub-mode'));
  const body = await readBody(request);
  if (body === null) {
    send(response, { status: 413, body: { error: 'That photo is too large (15 MB maximum).' } });
    return;
  }
  if (route === '/api/understand') {
    const contentType = header(request, 'content-type') ?? '';
    send(
      response,
      model
        ? await handleUnderstandWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.read })
        : await handleUnderstand({ mode, delayMs: delayFor(mode), contentType, bytes: body.length }),
    );
    return;
  }
  const parsed = parseJson(body);
  const scene = typeof parsed === 'object' && parsed !== null && 'scene' in parsed ? parsed.scene : null;
  send(
    response,
    model
      ? await handleDraftQuestionsWithModel({ scene, drafter: model.name, draft: model.draft })
      : await handleDraftQuestions({ mode, delayMs: delayFor(mode), scene }),
  );
};

export const stubApi = ({ env }: ApiOptions): Plugin => ({
  name: 'board-to-life-stub-api',
  configureServer(server) {
    const model = modelFrom(env);
    server.config.logger.info(`scene reader and question drafter: ${model ? `${model.name} (paid model calls)` : 'stub'}`);
    server.middlewares.use(apiMiddleware({ env }, model));
  },
});
