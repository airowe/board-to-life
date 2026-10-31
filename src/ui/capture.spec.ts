import { describe, expect, it, vi } from 'vitest';
import { createCamera, fetchSample } from './capture';

type FakeStream = { getTracks: () => { stop: () => void }[]; stopped: number };

const fakeStream = (): FakeStream => {
  const stream: FakeStream = { stopped: 0, getTracks: () => [{ stop: () => void (stream.stopped += 1) }] };
  return stream;
};

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('createCamera', () => {
  it('stops a stream that arrives after the camera was closed', async () => {
    const pending = deferred<FakeStream>();
    const camera = createCamera(() => pending.promise);
    const started = camera.start();
    camera.stop();
    const late = fakeStream();
    pending.resolve(late);
    expect(await started).toBeNull();
    expect(late.stopped).toBe(1);
  });

  it('stops the first stream when the camera is started twice', async () => {
    const [first, second] = [fakeStream(), fakeStream()];
    const opens = [deferred<FakeStream>(), deferred<FakeStream>()];
    let call = 0;
    const camera = createCamera(() => opens[call++]?.promise ?? Promise.reject(new Error('too many opens')));
    const firstStart = camera.start();
    const secondStart = camera.start();
    opens[0]?.resolve(first);
    opens[1]?.resolve(second);
    expect(await firstStart).toBeNull();
    expect(await secondStart).toBe(second);
    expect([first.stopped, second.stopped]).toEqual([1, 0]);
  });

  it('stops the live stream when closed', async () => {
    const live = fakeStream();
    const camera = createCamera(() => Promise.resolve(live));
    expect(await camera.start()).toBe(live);
    camera.stop();
    expect(live.stopped).toBe(1);
  });
});

describe('fetchSample', () => {
  const answer = (init: { ok: boolean; type: string }): typeof fetch =>
    vi.fn(() => Promise.resolve({ ok: init.ok, blob: () => Promise.resolve(new Blob(['x'], { type: init.type })) } as Response));

  it('returns the image', async () => {
    const blob = await fetchSample('/s.png', answer({ ok: true, type: 'image/png' }));
    expect(blob?.type).toBe('image/png');
  });

  it.each([
    { name: 'a 404', init: { ok: false, type: 'text/html' } },
    { name: 'an index page answered as 200', init: { ok: true, type: 'text/html' } },
  ])('returns null for $name', async ({ init }) => {
    expect(await fetchSample('/s.png', answer(init))).toBeNull();
  });

  it('returns null when the network fails', async () => {
    expect(await fetchSample('/s.png', () => Promise.reject(new TypeError('offline')))).toBeNull();
  });
});
