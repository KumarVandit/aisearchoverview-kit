export type GoogleSearchErrorKind = 'http' | 'network' | 'parse' | 'timeout';

export class GoogleSearchError extends Error {
  readonly access?: 'blocked' | 'regional-redirect' | 'redirect';
  constructor(
    message: string,
    readonly kind: GoogleSearchErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions & {access?: 'blocked' | 'regional-redirect' | 'redirect'},
  ) {
    super(message, options);
    this.name = 'GoogleSearchError';
    this.access = options?.access;
  }
}
