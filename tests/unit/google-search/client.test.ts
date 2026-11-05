import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSearchClient, GoogleSearchError, googleSearch } from '../../../src/google-search.js';

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/google-search/${name}`, import.meta.url), 'utf8');
}

afterEach(() => { vi.useRealTimers(); });

describe('Google Search requests', () => {
  it('fetches the public Search page once with encoded query and locale options', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(fixture('javascript-required.html')));
    const client = googleSearch({ fetch: fetchMock, language: 'fr', country: 'fr' });

    const response = await client.search('cats & dogs', { language: 'en', country: 'gb', start: 10, safe: 'active' });

    expect(client).toBeInstanceOf(GoogleSearchClient);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'cats & dogs', hl: 'en', gl: 'gb', start: '10', safe: 'active' });
    expect(init?.method).toBe('GET');
    expect(init?.headers).toBeUndefined();
    expect(response).toMatchObject({ query: 'cats & dogs', status: 'javascript-required', aiOverview: { status: 'unverified' } });
  });

  it('returns throttling as blocked, includes Retry-After and does not retry', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '2' } }));

    const response = await googleSearch({ fetch: fetchMock }).search('typescript');

    expect(response).toMatchObject({ status: 'blocked', httpStatus: 429, retryAfterMs: 2000, aiOverview: { status: 'blocked' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses a complete HTTP response without a browser using a derived pre-mount-id rendered fixture', async () => {
    const derived = fixture('aio-sky-expanded.html').replace('id="m-x-content"', '');
    const split = derived.indexOf('data-container-id="main-col"');
    expect(split).toBeGreaterThan(0);
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(derived.slice(0, split)));
      controller.enqueue(encoder.encode(derived.slice(split)));
      controller.close();
    } });
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body));

    const response = await googleSearch({ fetch: fetchMock }).search('why is the sky blue');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('present');
    expect(response.aiOverview.text).toContain('Different wavelengths:');
    expect(response.aiOverview.sources).toHaveLength(7);
  });

  it('returns the Overview from the captured initial HTTP document structure without supplying a browser', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(fixture('aio-sky-http.html')));

    const response = await googleSearch({ fetch: fetchMock }).search('why is the sky blue');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({ status: 'results', aiOverview: { status: 'present' } });
    expect(response.aiOverview.text).toContain('Rayleigh Scattering:');
    expect(response.aiOverview.sources).toHaveLength(4);
    expect(response.aiOverview.sources.every(source => source.url.startsWith('https://www.google.com/goto?url=redacted-destination-'))).toBe(true);
  });

  it('returns the captured challenge explicitly, optionally preserving response HTML', async () => {
    const html = fixture('blocked.html');
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(html));
    const response = await googleSearch({ fetch: fetchMock }).search('typescript', { includeRawHtml: true });
    expect(response.status).toBe('blocked');
    expect(response.rawHtml).toBe(html);
  });

  it('fetches autocomplete independently of Search and preserves its metadata', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(fixture('autocomplete.json')));

    const response = await googleSearch({ fetch: fetchMock }).suggest('typescript');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://suggestqueries.google.com/complete/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ client: 'firefox', q: 'typescript', hl: 'en', gl: 'us' });
    expect(response.suggestions).toContain('typescript documentation');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distinguishes malformed JSON, invalid tuples, transport errors and HTTP failure', async () => {
    const malformed = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('<html>not JSON</html>'));
    await expect(googleSearch({ fetch: malformed }).suggest('test')).rejects.toMatchObject({ kind: 'parse' });
    const invalid = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}'));
    await expect(googleSearch({ fetch: invalid }).suggest('test')).rejects.toMatchObject({ kind: 'parse' });
    const cause = new TypeError('connection reset');
    const failed = vi.fn<typeof globalThis.fetch>().mockRejectedValue(cause);
    await expect(googleSearch({ fetch: failed }).search('test')).rejects.toMatchObject({ kind: 'network', cause });
    const denied = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('denied', { status: 403 }));
    await expect(googleSearch({ fetch: denied }).suggest('test')).rejects.toMatchObject({ kind: 'http', status: 403 });
    const unavailable = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(googleSearch({ fetch: unavailable }).search('test')).rejects.toMatchObject({ kind: 'http', status: 503 });
  });

  it('validates inputs before starting a network request', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const client = googleSearch({ fetch: fetchMock });
    await expect(client.search(' ')).rejects.toBeInstanceOf(TypeError);
    await expect(client.suggest('')).rejects.toBeInstanceOf(TypeError);
    await expect(client.search('query', { start: -1 })).rejects.toBeInstanceOf(RangeError);
    expect(() => googleSearch({ timeoutMs: 0 })).toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves caller cancellation and avoids fetching when already aborted', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const controller = new AbortController();
    const reason = new Error('canceled');
    controller.abort(reason);
    await expect(googleSearch({ fetch: fetchMock }).search('query', { signal: controller.signal })).rejects.toBe(reason);
    await expect(googleSearch({ fetch: fetchMock }).suggest('query', { signal: controller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces a deadline while consuming a response body even if the injected fetch ignores abort', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ text: () => new Promise<string>(() => {}) } as Response);
    const rejected = expect(googleSearch({ fetch: fetchMock, timeoutMs: 50 }).search('query')).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(50);

    await rejected;
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(fetchMock.mock.calls[0]![1]?.signal?.reason).toBeInstanceOf(GoogleSearchError);
  });

  it('aborts a pending network request on caller cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('stop request');
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    const rejected = expect(googleSearch({ fetch: fetchMock }).suggest('query', { signal: controller.signal })).rejects.toBe(reason);

    controller.abort(reason);

    await rejected;
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });
});
