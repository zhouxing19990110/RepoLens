export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryAfterSeconds?: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}
