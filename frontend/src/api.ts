import { ApiError } from './apiError';
import type { Analysis, Assessment } from './types';

interface ErrorEnvelope { error?: { code?: string; message?: string; retry_after_seconds?: number | null } }

async function postRepository<T>(endpoint: 'analyze' | 'assess', url: string, signal: AbortSignal, fallback: string, language?: 'zh' | 'en'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api/repositories/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(language ? { url, language } : { url }), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError('connection_error', 'Could not connect to RepoLens. Check that the API is running.');
  }
  if (!response.ok) {
    const envelope = await response.json().catch(() => null) as ErrorEnvelope | null;
    const message = envelope?.error?.message;
    if (!envelope?.error?.code && !envelope?.error?.message && response.status >= 500) {
      throw new ApiError('service_unavailable', 'The analysis service is unavailable. Check that the backend is running.');
    }
    throw new ApiError(envelope?.error?.code ?? 'unknown', typeof message === 'string' && message.trim() ? message : fallback, envelope?.error?.retry_after_seconds);
  }
  return await response.json() as T;
}

export function analyzeRepository(url: string, signal: AbortSignal): Promise<Analysis> {
  return postRepository<Analysis>('analyze', url, signal, 'Repository analysis failed. Please try again.');
}

export async function assessRepository(url: string, signal: AbortSignal, language: 'zh' | 'en' = 'zh'): Promise<Assessment> {
  return postRepository<Assessment>('assess', url, signal, 'AI assessment failed. Please try again.', language);
}
