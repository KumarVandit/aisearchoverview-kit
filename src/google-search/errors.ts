export type GoogleSearchErrorKind = 'http' | 'network' | 'parse' | 'timeout';

export class GoogleSearchError extends Error {
  constructor(
    message: string,
    readonly kind: GoogleSearchErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleSearchError';
  }
}
