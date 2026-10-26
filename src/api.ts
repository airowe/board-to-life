export type ApiFailure = { ok: false; retryable: boolean; message: string; details?: string[] };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

type Options = { timeoutMs: number; fetchImpl?: typeof fetch };

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const errorBody = (body: unknown): { error?: string; details?: string[] } =>
  typeof body === 'object' && body !== null ? (body as { error?: string; details?: string[] }) : {};

export const requestJson = async (url: string, init: RequestInit, options: Options): Promise<ApiResult<unknown>> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await readJson(response);
    if (response.ok) return { ok: true, data: body };
    const { error, details } = errorBody(body);
    const failure: ApiFailure = {
      ok: false,
      retryable: true,
      message: error ?? `The server answered with an error (${response.status}).`,
    };
    return details && details.length > 0 ? { ...failure, details } : failure;
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'AbortError';
    return {
      ok: false,
      retryable: true,
      message: timedOut
        ? `The scene reader did not answer within ${Math.round(options.timeoutMs / 1000)} seconds.`
        : 'Could not reach the server. Check the connection and try again.',
    };
  } finally {
    clearTimeout(timer);
  }
};
