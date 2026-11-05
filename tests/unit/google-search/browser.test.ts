import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleSearch, type GoogleSearchBrowserPage } from '../../../src/google-search.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const QUERY = 'why is the sky blue';
const HTML = loadNestedFixture('google-search', 'aio-sky-collapsed.html');

function browser(options: { html?: string; redirect?: string; hang?: boolean } = {}) {
  let url = 'about:blank', expanded = false;
  const click = vi.fn(async () => { expanded = true; });
  const page: GoogleSearchBrowserPage = {
    url: () => url,
    goto: vi.fn(async next => { url = options.redirect ?? next; }),
    content: vi.fn(() => options.hang ? new Promise<string>(() => {}) : Promise.resolve(options.html ?? HTML)),
    locator: vi.fn(() => ({ count: async () => 1, isVisible: async () => !expanded, getAttribute: async () => expanded ? 'true' : 'false', click })),
  };
  return { page, click };
}

afterEach(() => vi.useRealTimers());

describe('Google AI Overview browser observation', () => {
  it('requires an injected browser and rejects an empty query before navigation', async () => {
    await expect(googleSearch().aiOverview(QUERY)).rejects.toThrow(/caller-owned browser/);
    const { page } = browser();
    await expect(googleSearch({ page }).aiOverview('  ')).rejects.toThrow(/nonempty/);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('navigates the requested normal Search query, expands once and returns observed text and citations', async () => {
    vi.useFakeTimers();
    const { page, click } = browser();
    const waiting = googleSearch({ page }).aiOverview(QUERY, { timeoutMs: 100, pollIntervalMs: 5, settleMs: 10 });
    await vi.advanceTimersByTimeAsync(25);
    const result = await waiting;

    expect(page.goto).toHaveBeenCalledWith('https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us', { waitUntil: 'domcontentloaded', timeout: 100 });
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'present', query: QUERY, transport: 'browser', expanded: true, settled: true, timedOut: false });
    expect(result.text).toContain('Rayleigh scattering');
    expect(result.sources.some(source => source.url === 'https://spaceplace.nasa.gov/blue-sky/')).toBe(true);
  });

  it('allows a snapshot without clicking expansion controls', async () => {
    vi.useFakeTimers();
    const { page, click } = browser();
    const waiting = googleSearch({ page }).aiOverview(QUERY, { expand: false, timeoutMs: 100, pollIntervalMs: 5, settleMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    expect(await waiting).toMatchObject({ status: 'present', expanded: false, settled: true });
    expect(click).not.toHaveBeenCalled();
  });

  it.each([
    ['https://www.google.com/sorry/index', 'blocked'],
    ['https://accounts.google.com/ServiceLogin', 'unverified'],
    ['https://consent.google.com/m', 'unverified'],
    ['https://www.google.com/search?q=another+query', 'unverified'],
    ['https://www.google.com/search?q=why+is+the+sky+blue&udm=50', 'unverified'],
  ])('preserves the access/product boundary for %s', async (redirect, status) => {
    const { page, click } = browser({ redirect });
    const result = await googleSearch({ page }).aiOverview(QUERY);
    expect(result).toMatchObject({ status, settled: false, timedOut: false, sources: [] });
    expect(page.content).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('returns unverified at the deadline when no recognized overview appears', async () => {
    vi.useFakeTimers();
    const { page } = browser({ html: '<main id="rso"><p>Ordinary results without a recognized Overview.</p></main>' });
    const waiting = googleSearch({ page }).aiOverview(QUERY, { timeoutMs: 30, pollIntervalMs: 5, settleMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(await waiting).toMatchObject({ status: 'unverified', sources: [], settled: false, timedOut: true });
  });

  it('bounds an adapter that never resolves content reads', async () => {
    vi.useFakeTimers();
    const { page } = browser({ hang: true });
    const waiting = googleSearch({ page }).aiOverview(QUERY, { timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(30);
    expect(await waiting).toMatchObject({ status: 'unverified', timedOut: true });
  });

  it('preserves caller cancellation before browser mutation', async () => {
    const { page } = browser();
    const controller = new AbortController(), reason = new Error('stop');
    controller.abort(reason);
    await expect(googleSearch({ page }).aiOverview(QUERY, { signal: controller.signal })).rejects.toBe(reason);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('rejects overlapping queries and releases the client after cancellation', async () => {
    const { page } = browser({ hang: true });
    const client = googleSearch({ page });
    const controller = new AbortController(), reason = new Error('stop waiting');
    const waiting = expect(client.aiOverview(QUERY, { signal: controller.signal })).rejects.toBe(reason);
    await expect(client.aiOverview(QUERY)).rejects.toThrow(/observation in progress/);
    controller.abort(reason);
    await waiting;
    await expect(client.aiOverview('', { signal: controller.signal })).rejects.toThrow(/nonempty/);
  });
});
