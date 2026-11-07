import { describe, it, expect, vi } from 'vitest';
import { sdk, AiSearchOverviewClient, AiSearchError } from '../../src/index.js';
import { loadNestedFixture } from '../helpers/fixtures.js';

const html = loadNestedFixture('google-search', 'aio-sky-simplified-http.html');
const sourceUrl = 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us';

describe('public Overview SDK', () => {
  it('exposes purpose-based namespaces and extracts saved HTML without a runtime or network', () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = sdk({ fetch: fetcher });
    expect(client).toBeInstanceOf(AiSearchOverviewClient);
    const result = client.overview.parse(html, { sourceUrl });
    expect(result).toMatchObject({ status: 'present', query: 'why is the sky blue', metadata: { transport: 'snapshot', completeness: 'unverified' } });
    if (result.status !== 'present') throw new Error('Expected answer');
    expect(result.text).toContain('Rayleigh Scattering');
    expect(result.markdown).toBeDefined();
    expect(result.sources).toHaveLength(7);
    expect(result.sources[0]).toMatchObject({ position: 1, title: expect.stringContaining('NASA'), redirectUrl: expect.stringContaining('/url?') });
    expect(fetcher).not.toHaveBeenCalled();
    expect(client).not.toHaveProperty('monitor');
  });
  it('preserves actual inline citation groups and their source positions in the public SDK', () => {
    const result = sdk().overview.parse(loadNestedFixture('google-search', 'aio-sky-expanded.html'), { sourceUrl });
    if (result.status !== 'present') throw new Error('Expected captured answer');
    expect(result.citationPills?.length).toBeGreaterThan(0);
    for (const pill of result.citationPills ?? []) {
      expect(result.sources[pill.position - 1]?.url).toBe(pill.url);
      expect(pill.citationPillId).toBeGreaterThan(0);
    }
    const simple = sdk().overview.parse(html, { sourceUrl });
    expect(simple).not.toHaveProperty('citationPills');
  });
  it('uses custom HTTP and locale options with one request and opt-out Markdown', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
    const result = await sdk({ fetch: fetcher, locale: { country: 'GB', language: 'en' } }).overview.get('why is the sky blue', { markdown: false });
    expect(result.status).toBe('present');
    expect(result.metadata).toMatchObject({ country: 'GB', transport: 'http' });
    expect(result).not.toHaveProperty('markdown');
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get('gl')).toBe('gb');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns explicit blocked/unverified states and typed argument or network errors', async () => {
    expect((await sdk({ fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 })) }).overview.get('query')).status).toBe('blocked');
    expect((await sdk({ fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>unknown</html>')) }).overview.get('query')).status).toBe('unverified');
    await expect(sdk({ fetch: vi.fn() }).overview.get('')).rejects.toMatchObject({ kind: 'validation' });
    await expect(sdk({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')) }).overview.get('query')).rejects.toBeInstanceOf(AiSearchError);
  });
  it.each([
    {body:loadNestedFixture('google-search', 'javascript-required.html'), searchStatus:'javascript-required', reason:'requiring JavaScript'},
    {body:'<html><body><form action="https://consent.google.com/save"><button>Continue</button></form></body></html>', searchStatus:'consent-required', reason:'requiring consent'},
  ])('preserves HTTP 200 $searchStatus without claiming an absent Overview', async ({body, searchStatus, reason}) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, {status: 200}));
    const result = await sdk({fetch: fetcher}).overview.get('example');
    expect(result).toMatchObject({status:'unverified',sources:[],metadata:{httpStatus:200,searchStatus}});
    expect(result.reason).toContain(reason);
    expect(result.reason).toContain('presence is unverified');
    expect(result).not.toHaveProperty('text');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps a denied JavaScript-shaped response blocked rather than overriding its access reason', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(loadNestedFixture('google-search', 'javascript-required.html'), {status:403}));
    const result = await sdk({fetch: fetcher}).overview.get('example');
    expect(result).toMatchObject({status:'blocked',sources:[],metadata:{httpStatus:403,searchStatus:'blocked'}});
    expect(result.reason).not.toContain('requiring JavaScript');
    expect(result).not.toHaveProperty('text');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves the caller cancellation reason', async () => {
    const controller = new AbortController(); const reason = new Error('stop'); controller.abort(reason);
    await expect(sdk({ fetch: vi.fn() }).overview.get('query', { signal: controller.signal })).rejects.toBe(reason);
  });
  it('keeps batch order and individual errors with bounded concurrency', async () => {
    let active = 0, peak = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
      if (new URL(String(input)).searchParams.get('q') === 'bad') throw new Error('offline');
      return new Response(html);
    });
    const results = await sdk({ fetch: fetcher }).overview.batch(['one', 'bad', 'three'], { concurrency: 2 });
    expect(results.map(item => item.query)).toEqual(['one', 'bad', 'three']);
    expect(results.map(item => item.ok)).toEqual([true, false, true]);
    expect(peak).toBe(2);
    await expect(sdk({ fetch: fetcher }).overview.batch(['query'], { concurrency: 0 })).rejects.toMatchObject({ kind: 'validation' });
  });
  it('resolves Google redirects without fetching publisher pages or changing caller objects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://spaceplace.nasa.gov/blue-sky/' } }));
    const sources = [{ position: 1, title: 'NASA', url: 'https://www.google.com/url?q=CAESopaque&uoh=3' }, { position: 2, title: 'Direct', url: 'https://example.com/' }];
    const result = await sdk({ fetch: fetcher }).sources.resolve(sources);
    expect(result.resolved).toBe(1); expect(result.sources[0]).toMatchObject({ url: 'https://spaceplace.nasa.gov/blue-sky/', redirectUrl: sources[0]!.url });
    expect(sources[0]!.url).toContain('www.google.com');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });
  it('retains unresolved links and rejects invalid transport options', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'javascript:alert(1)' } }));
    const result = await sdk({ fetch: fetcher }).sources.resolve([{ position: 1, title: 'Source', url: 'https://www.google.com/goto?url=opaque' }]);
    expect(result.resolved).toBe(0); expect(result.warnings).toHaveLength(1);
    expect(() => sdk({ timeoutMs: 0 })).toThrow(AiSearchError);
    expect(() => sdk({ transport: 'browser' as 'http' })).toThrow(AiSearchError);
  });
});
