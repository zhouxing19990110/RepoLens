import type { Analysis, Assessment } from './types';

interface ErrorEnvelope { error?: { code?: string; message?: string; retry_after_seconds?: number | null } }

async function postRepository<T>(endpoint: 'analyze' | 'assess', url: string, signal: AbortSignal, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/repositories/${endpoint}`, {
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
    throw new Error(typeof message === 'string' && message.trim() ? message : fallback);
  }
  return await response.json() as T;
}

export function analyzeRepository(url: string, signal: AbortSignal): Promise<Analysis> {
  return postRepository<Analysis>('analyze', url, signal, 'Repository analysis failed. Please try again.');
}

export async function assessRepository(url: string, signal: AbortSignal): Promise<Assessment> {
  return postRepository<Assessment>('assess', url, signal, 'AI assessment failed. Please try again.');
}
