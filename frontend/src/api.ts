import type { Analysis } from './types';

interface ErrorEnvelope { error?: { code?: string; message?: string; retry_after_seconds?: number | null } }

export async function analyzeRepository(url: string, signal: AbortSignal): Promise<Analysis> {
  let response: Response;
  try {
    response = await fetch('/api/repositories/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Could not connect to RepoLens. Check that the API is running.');
  }
  if (!response.ok) {
    const envelope = await response.json().catch(() => null) as ErrorEnvelope | null;
    const message = envelope?.error?.message;
    throw new Error(typeof message === 'string' && message.trim() ? message : 'Repository analysis failed. Please try again.');
  }
  return await response.json() as Analysis;
}
