import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleSearch, googleSearchMonitorHttpStatus, parseGoogleSearchMonitorHtml, parseGoogleSearchHtml, formatGoogleSearchMonitorResponse, type GoogleSearchBrowserPage, type GoogleSearchMonitorRequest } from '../../../src/google-search.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const query = 'why is the sky blue';
const sourceUrl = 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us';
const request = { query, country: 'US', include: { aioverview: { markdown: true } } } satisfies GoogleSearchMonitorRequest;
const fixture = (name: string) => loadNestedFixture('google-search', name);

afterEach(() => vi.useRealTimers());

describe('structured Google Search monitoring', () => {
  it('preserves opaque source redirects from an accepted embedded-runtime HTTP response', () => {
    const response = parseGoogleSearchMonitorHtml(fixture('aio-sky-simplified-http.html'), request, { sourceUrl });
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.result.aioverview?.text).toContain('Rayleigh Scattering');
    expect(response.result.aioverview?.sources).toHaveLength(7);
    for (const source of response.result.aioverview!.sources) {
      expect(source.redirectLink).toBe(source.url);
      expect(new URL(source.url).searchParams.get('uoh')).toBe('3');
    }
  });

  it('extracts the actual HTTP fixture into positional sources and preserves unresolved Google redirects', () => {
    const response = parseGoogleSearchMonitorHtml(fixture('aio-sky-http.html'), request, { sourceUrl });
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.result.aioverview?.text).toContain('atmosphere scatters sunlight');
    expect(response.result.aioverview?.sources).toHaveLength(4);
    expect(response.result.aioverview?.sources[0]).toMatchObject({ position: 1, label: expect.stringContaining('NASA'), url: expect.stringContaining('/goto?'), redirectLink: expect.stringContaining('/goto?') });
    expect(response.metadata).toMatchObject({ transport: 'snapshot', aiOverview: { requested: true, status: 'present', completeness: 'unverified' } });
    expect(response.result.aioverview).not.toHaveProperty('ads');
    expect(response.result.aioverview).not.toHaveProperty('relatedLinks');
  });

  it.each([true, {}, { markdown: false }])('omits Markdown unless requested explicitly: %j', aioverview => {
    const response = parseGoogleSearchMonitorHtml(fixture('aio-sky-expanded.html'), { query, gl: 'US', include: { aioverview } }, { sourceUrl });
    expect(response.success).toBe(true);
    if (response.success) expect(response.result.aioverview).not.toHaveProperty('markdown');
  });

  it('retains headings, emphasis, lists and observed inline citation links in Markdown', () => {
    const response = parseGoogleSearchMonitorHtml(fixture('aio-sky-expanded.html'), request, { sourceUrl });
    expect(response.success).toBe(true);
    if (!response.success) return;
    const overview = response.result.aioverview!;
    expect(overview.markdown).toMatch(/###? /);
    expect(overview.markdown).toMatch(/\*\*[^*]+\*\*/);
    expect(overview.markdown).toMatch(/(?:^|\n)- /);
    expect(overview.markdown).toContain('](https://');
    expect(overview.markdown).not.toMatch(/Show more|Error translating|AI Mode replied/);
    expect(overview.citationPills?.length).toBeGreaterThan(0);
    for (const pill of overview.citationPills ?? []) {
      expect(overview.sources[pill.position - 1]?.url).toBe(pill.url);
      expect(pill.citationPillId).toBeGreaterThan(0);
      expect(pill.domain).toBe(new URL(pill.url).hostname);
    }
  });

  it('does not turn HTML or unsafe links into executable Markdown', () => {
    const html = '<section aria-label="AI Overview"><h2>AI Overview</h2><p>Literal &lt;script&gt; and [text]. <strong>Bold</strong> <a href="javascript:alert(1)">unsafe</a> <a href="https://example.com/a(b)">safe</a></p><script>bad()</script><p hidden>Hidden</p></section>';
    const response = parseGoogleSearchMonitorHtml(html, request, { sourceUrl });
    if (!response.success) throw new Error(response.error.message);
    const markdown = response.result.aioverview?.markdown;
    expect(markdown).toContain('\\<script\\>');
    expect(markdown).toContain('\\[text\\]');
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('[safe](https://example.com/a%28b%29)');
    expect(markdown).not.toMatch(/javascript:|bad\(\)|Hidden/);
  });

  it('omits an unrequested Overview and maps existing Search results', () => {
    const response = parseGoogleSearchMonitorHtml(fixture('structural-search.html'), { query: 'typescript', country: 'US' }, { sourceUrl: 'https://www.google.com/search?q=typescript' });
    if (!response.success) throw new Error(response.error.message);
    expect(response.result).not.toHaveProperty('aioverview');
    expect(response.result.organicResults?.[0]).toHaveProperty('link');
    expect(response.result.peopleAlsoAsk?.[0]).toMatchObject({ question: expect.any(String), type: 'UNKNOWN' });
    expect(response.result.relatedSearches?.[0]).toHaveProperty('link');
    expect(response.metadata.aiOverview.status).toBe('not-requested');
  });

  it('does not infer an absent Overview from ordinary result markup', () => {
    const response = parseGoogleSearchMonitorHtml('<div id="rso"><a href="https://example.com"><h3>Result</h3></a></div>', request, { sourceUrl });
    expect(response.success).toBe(true);
    if (response.success) expect(response.result).not.toHaveProperty('aioverview');
    expect(response.metadata.aiOverview.status).toBe('unverified');
  });

  it.each([
    ['javascript-required.html', 'JAVASCRIPT_REQUIRED'], ['blocked.html', 'BLOCKED'],
  ])('returns an explicit failed envelope for %s', (name, code) => {
    const response = parseGoogleSearchMonitorHtml(fixture(name), request, { sourceUrl });
    expect(response).toMatchObject({ success: false, error: { code } });
    expect(googleSearchMonitorHttpStatus(response)).toBe(502);
    expect(response).not.toHaveProperty('result');
  });

  it('uses one direct HTTP request by default even when a browser was configured', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('aio-sky-http.html')));
    const goto = vi.fn();
    const response = await googleSearch({ fetch: fetcher, page: { goto } as unknown as GoogleSearchBrowserPage }).monitor({ ...request, country: 'GB', gl: 'gb', hl: 'en-GB' });
    expect(response.success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get('gl')).toBe('gb');
    expect(url.searchParams.get('hl')).toBe('en-GB');
    expect(goto).not.toHaveBeenCalled();
    expect(response.metadata.transport).toBe('http');
  });

  it.each([
    null, [], {}, { query: '', country: 'US' }, { query, country: 'us' }, { query, country: 'US', gl: 'gb' },
    { query, country: 'US', pages: 2 }, { query, country: 'US', location: 'New York' },
    { query, country: 'US', include: { html: true } }, { query, country: 'US', include: { aioverview: { markdown: 'true' } } },
    { query, country: 'US', include: { aioverview: { html: true } } }, { query, country: 'US', include: null },
    { query, country: 'US', include: { aioverview: [] } }, { query, country: 'US', hl: 'en&gl=GB' },
  ])('rejects unsupported or malformed input before fetching: %j', async input => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await googleSearch({ fetch: fetcher }).monitor(input as GoogleSearchMonitorRequest);
    expect(response).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR', details: expect.any(Array) } });
    expect(googleSearchMonitorHttpStatus(response)).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects mismatched saved-response query attribution', () => {
    expect(parseGoogleSearchMonitorHtml(fixture('aio-sky-http.html'), request, { sourceUrl: 'https://www.google.com/search?q=another' })).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('formats an existing response without requests', () => {
    const parsed = parseGoogleSearchHtml(fixture('aio-sky-http.html'), { sourceUrl });
    expect(formatGoogleSearchMonitorResponse(parsed, request).success).toBe(true);
  });

  it('makes browser transport explicit and preserves observation limits', async () => {
    vi.useFakeTimers();
    let url = '';
    const page: GoogleSearchBrowserPage = {
      url: () => url, goto: async value => { url = value; }, content: async () => fixture('aio-sky-expanded.html'),
      locator: () => ({ count: async () => 0, isVisible: async () => false, getAttribute: async () => null, click: async () => {} }),
    };
    const fetcher = vi.fn<typeof fetch>();
    const waiting = googleSearch({ page, fetch: fetcher }).monitor(request, { transport: 'browser', browser: { timeoutMs: 100, settleMs: 10, pollIntervalMs: 5 } });
    await vi.advanceTimersByTimeAsync(25);
    const response = await waiting;
    expect(response.success).toBe(true);
    expect(response.metadata).toMatchObject({ transport: 'browser', settled: true, aiOverview: { completeness: 'unverified' } });
    if (response.success) expect(response.result).not.toHaveProperty('organicResults');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns network failure details and preserves caller cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(await googleSearch({ fetch: fetcher }).monitor(request)).toMatchObject({ success: false, error: { code: 'NETWORK_ERROR' } });
    const controller = new AbortController(), reason = new Error('cancel');
    controller.abort(reason);
    await expect(googleSearch({ fetch: fetcher }).monitor(request, { signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps retry guidance, query attribution and opt-in raw HTML even for blocked responses', async () => {
    const html = fixture('blocked.html');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(html, { status: 429, headers: { 'Retry-After': '2' } }));
    const client = googleSearch({ fetch: fetcher });
    const defaultResponse = await client.monitor(request);
    expect(defaultResponse.metadata).toMatchObject({ query, retryAfterMs: 2000, httpStatus: 429, searchStatus: 'blocked' });
    expect(defaultResponse.metadata).not.toHaveProperty('rawHtml');
    const retained = await client.monitor({ ...request, include: { ...request.include, rawHtml: true } });
    expect(retained.success).toBe(false);
    expect(retained.metadata.rawHtml).toBe(html);
  });

  it('measures delegated retrieval and total request duration with a monotonic clock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return new Response(fixture('aio-sky-http.html'));
    });
    const waiting = googleSearch({ fetch: fetcher }).monitor(request);
    await vi.advanceTimersByTimeAsync(50);
    const response = await waiting;
    expect(response.metadata.timing?.scope).toBe('request');
    expect(response.metadata.timing?.retrievalMs).toBeGreaterThanOrEqual(50);
    expect(response.metadata.timing!.totalMs).toBeGreaterThanOrEqual(response.metadata.timing!.retrievalMs!);
  });

  it('labels offline processing separately and retains raw snapshot HTML only when requested', () => {
    const html = fixture('aio-sky-http.html');
    const response = parseGoogleSearchMonitorHtml(html, { ...request, include: { ...request.include, rawHtml: true } }, { sourceUrl });
    expect(response.metadata.rawHtml).toBe(html);
    expect(response.metadata.timing).toMatchObject({ scope: 'snapshot-processing', totalMs: expect.any(Number) });
    expect(response.metadata.timing).not.toHaveProperty('retrievalMs');
    const converted = formatGoogleSearchMonitorResponse(parseGoogleSearchHtml(html, { sourceUrl, includeRawHtml: true }), request);
    expect(converted.metadata).not.toHaveProperty('rawHtml');
  });

  it('preserves response timing and retry guidance when the HTTP method throws an upstream error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('unavailable', { status: 503, headers: { 'Retry-After': '3' } }));
    const response = await googleSearch({ fetch: fetcher }).monitor(request);
    expect(response).toMatchObject({ success: false, error: { code: 'HTTP_ERROR' }, metadata: { query, httpStatus: 503, retryAfterMs: 3000, timing: { scope: 'request', retrievalMs: expect.any(Number) } } });
  });

  it('rejects unsupported raw HTML requests before fetching or browser navigation', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = googleSearch({ fetch: fetcher });
    expect(await client.monitor({ ...request, include: { rawHtml: 'true' } } as unknown as GoogleSearchMonitorRequest)).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(await client.monitor({ ...request, include: { ...request.include, rawHtml: true } }, { transport: 'browser' })).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
