import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeRepository, assessRepository } from '../api';
import { assessed, sample } from './fixtures';

afterEach(() => vi.unstubAllGlobals());

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
      body: JSON.stringify({ url: sample.url }), signal,
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
