import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeRepository, assessRepository } from '../api';
import { assessed, sample } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('repository API clients', () => {
  it.each([
    ['analyze', analyzeRepository, sample],
    ['assess', assessRepository, assessed],
  ] as const)('posts to %s with URL and abort signal', async (endpoint, call, payload) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await call(sample.url, signal)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`/api/repositories/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint === 'assess' ? { url: sample.url, language: 'zh' } : { url: sample.url }), signal,
    });
  });

  it.each([
    ['analyze', analyzeRepository, sample],
    ['assess', assessRepository, assessed],
  ] as const)('uses the deployment base for %s requests', async (endpoint, call, payload) => {
    vi.stubEnv('BASE_URL', '/repolens/');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await call(sample.url, signal)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`/repolens/api/repositories/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint === 'assess' ? { url: sample.url, language: 'zh' } : { url: sample.url }), signal,
    });
  });

  it.each([
    [analyzeRepository, 'Repository analysis failed. Please try again.'],
    [assessRepository, 'AI assessment failed. Please try again.'],
  ] as const)('uses the endpoint fallback for an invalid error body', async (call, fallback) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: {} }) }));
    await expect(call(sample.url, new AbortController().signal)).rejects.toThrow(fallback);
  });

  it('surfaces the API error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'AI unavailable.' } }) }));
    await expect(assessRepository(sample.url, new AbortController().signal)).rejects.toThrow('AI unavailable.');
  });

  it('preserves an aborted fetch rejection', async () => {
    const aborted = new Error('aborted');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    const controller = new AbortController();
    controller.abort();
    await expect(assessRepository(sample.url, controller.signal)).rejects.toBe(aborted);
  });
});
it('preserves structured rate-limit details for localization', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: {
    code: 'upstream_rate_limited', message: 'GitHub rate limit reached.', retry_after_seconds: 120,
  } }) }));
  await expect(analyzeRepository(sample.url, new AbortController().signal)).rejects.toMatchObject({
    name: 'ApiError', code: 'upstream_rate_limited', retryAfterSeconds: 120,
  });
});


it.each([500, 502, 503, 504])('explains an unstructured proxy failure (%s)', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => { throw new SyntaxError('empty response'); } }));
  await expect(analyzeRepository(sample.url, new AbortController().signal)).rejects.toMatchObject({
    code: 'service_unavailable', message: 'The analysis service is unavailable. Check that the backend is running.',
  });
});

it('preserves a structured server error even with HTTP 500', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } }) }));
  await expect(analyzeRepository(sample.url, new AbortController().signal)).rejects.toMatchObject({ code: 'internal_error' });
});
