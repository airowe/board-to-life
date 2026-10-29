import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ACCESS_HEADER } from '../src/access';
import { apiMiddleware } from './plugin';

const CODE = 'class-demo-42';
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let server: Server | null = null;

const serve = async (env: Record<string, string | undefined>): Promise<string> => {
  const handle = apiMiddleware({ env });
  server = createServer((request, response) =>
    handle(request, response, () => {
      response.statusCode = 404;
      response.end();
    }),
  );
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

afterEach(async () => {
  const running = server;
  server = null;
  if (running) await new Promise((resolve) => running.close(resolve));
});

const postPhoto = (base: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${base}/api/understand`, { method: 'POST', headers: { 'content-type': 'image/png', ...headers }, body: PNG_SIGNATURE });

describe('apiMiddleware', () => {
  it('reads with the stub when no access code is configured', async () => {
    const response = await postPhoto(await serve({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stub: true });
  });

  it.each([
    ['without a code', {}],
    ['with the wrong code', { [ACCESS_HEADER]: 'guess' }],
  ])('turns a request away %s when a code is configured', async (_case, headers) => {
    const response = await postPhoto(await serve({ ACCESS_CODE: CODE }), headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: expect.stringContaining('access link'), details: [] });
  });

  it('turns away a drafting request without the code too', async () => {
    const base = await serve({ ACCESS_CODE: CODE });
    const response = await fetch(`${base}/api/draft-questions`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });

  it('lets a request with the right code through', async () => {
    const response = await postPhoto(await serve({ ACCESS_CODE: CODE }), { [ACCESS_HEADER]: CODE });
    expect(response.status).toBe(200);
  });

  it('passes other routes on', async () => {
    const response = await fetch(`${await serve({ ACCESS_CODE: CODE })}/index.html`);
    expect(response.status).toBe(404);
  });
});
