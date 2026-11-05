export type AiSearchErrorKind = 'configuration' | 'validation' | 'network' | 'http' | 'parse' | 'timeout';

export class AiSearchError extends Error {
  constructor(message: string, readonly kind: AiSearchErrorKind, readonly status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiSearchError';
  }
}
