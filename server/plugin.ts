import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleDraftQuestions, handleUnderstand, parseStubMode, type StubMode, type StubResponse } from './stub';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const STUB_LATENCY_MS = 700;
const STUB_TIMEOUT_DELAY_MS = 30_000;

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

export const stubApi = (): Plugin => ({
  name: 'board-to-life-stub-api',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const route = request.url?.split('?')[0];
      if (request.method !== 'POST' || (route !== '/api/understand' && route !== '/api/draft-questions')) {
        next();
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
        send(response, await handleUnderstand({ mode, delayMs: delayFor(mode), contentType, bytes: body.length }));
        return;
      }
      const parsed = parseJson(body);
      const scene = typeof parsed === 'object' && parsed !== null && 'scene' in parsed ? parsed.scene : null;
      send(response, await handleDraftQuestions({ mode, delayMs: delayFor(mode), scene }));
    });
  },
});
