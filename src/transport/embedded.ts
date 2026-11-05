import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface EmbeddedSearchOptions {
  bootstrapExecutable: string;
  pythonExecutable?: string;
}

/** Runs a cold anonymous HTTP session with the separately built embedded DOM/JavaScript library. */
export function embeddedSearchFetch(options: EmbeddedSearchOptions): typeof globalThis.fetch {
  const packaged = fileURLToPath(new URL('../runtime/fetch.py', import.meta.url));
  const driver = existsSync(packaged) ? packaged : fileURLToPath(new URL('../../runtime/fetch.py', import.meta.url));
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (url.username || url.password || url.origin !== 'https://www.google.com' || url.pathname !== '/search' || url.hash || method.toUpperCase() !== 'GET') {
      throw new TypeError('The embedded transport supports only Google Search GET requests');
    }
    if (signal?.aborted) throw signal.reason;
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(options.pythonExecutable ?? 'python3', [driver, url.toString(), options.bootstrapExecutable], {
        signal: signal ?? undefined, timeout: 20_000, maxBuffer: 28 * 1024 * 1024,
      }, (error, stdout) => {
        if (error) reject(new Error('Embedded Search process failed', { cause: error }));
        else resolve(stdout);
      });
    });
    const result = JSON.parse(stdout) as { status: number; body: string; url: string; headers: Record<string, string> };
    if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 || typeof result.body !== 'string') throw new Error('Invalid embedded Search response');
    const finalUrl = new URL(result.url);
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== '/search') throw new Error('Unexpected embedded Search response URL');
    const response = new Response(result.body, { status: result.status, headers: result.headers });
    Object.defineProperty(response, 'url', { value: url.toString() });
    return response;
  };
}
