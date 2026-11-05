import { GoogleSearchError } from './errors.js';
import { parseGoogleAiOverviewHtml } from './parsers.js';
import type { GoogleAiOverview, GoogleAiOverviewBrowserOptions, GoogleAiOverviewBrowserResponse, GoogleSearchBrowserPage } from './types.js';

function duration(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RangeError(`${name} must be positive and no greater than 2147483647`);
  return value;
}

async function interruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await interruptible(new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }), signal); }
  finally { clearTimeout(timer); }
}

export async function browserAiOverview(page: GoogleSearchBrowserPage, url: URL, query: string, options: GoogleAiOverviewBrowserOptions): Promise<GoogleAiOverviewBrowserResponse> {
  const timeoutMs = duration(options.timeoutMs ?? 20_000, 'timeoutMs');
  const interval = duration(options.pollIntervalMs ?? 250, 'pollIntervalMs');
  const settleMs = duration(options.settleMs ?? 1000, 'settleMs');
  if (options.signal?.aborted) throw options.signal.reason;
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = new GoogleSearchError('AI Overview browser observation timed out', 'timeout');
  const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
  const expiresAt = Date.now() + timeoutMs;
  let best: GoogleAiOverview = { status: 'unverified', sources: [], reason: 'No recognized AI Overview was observed; absence, deferred loading and changed markup cannot be distinguished.' };
  let sourceUrl = url.toString(), expanded = false, expansionAttempted = false, fingerprint = '', unchangedSince = Date.now();
  const result = (settled: boolean, timedOut = false): GoogleAiOverviewBrowserResponse => ({ ...best, query, sourceUrl, transport: 'browser', expanded, settled, timedOut });
  try {
    await interruptible(page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: timeoutMs }), controller.signal);
    while (true) {
      if (controller.signal.aborted) throw controller.signal.reason;
      sourceUrl = page.url();
      const current = new URL(sourceUrl);
      if (current.hostname === 'accounts.google.com' || current.hostname === 'consent.google.com') {
        best = { status: 'unverified', sources: [], reason: 'Google requires sign-in or consent in the supplied browser; the SDK does not complete those steps.' };
        return result(false);
      }
      if (['www.google.com', 'google.com'].includes(current.hostname) && current.pathname.startsWith('/sorry/')) {
        best = { status: 'blocked', sources: [], reason: 'Google returned a traffic challenge in the supplied browser.' };
        return result(false);
      }
      if (current.origin !== url.origin || current.pathname !== '/search' || current.searchParams.get('q') !== query || current.searchParams.get('udm') === '50') {
        best = { status: 'unverified', sources: [], reason: 'The browser did not remain on the requested normal Google Search query.' };
        return result(false);
      }
      best = parseGoogleAiOverviewHtml(await interruptible(page.content(), controller.signal), sourceUrl);
      if (best.status === 'blocked') return result(false);
      if (best.status === 'present') {
        const more = page.locator('[aria-label="Show more AI Overview"][role="button"]');
        const count = await interruptible(more.count(), controller.signal);
        const state = count === 1 ? await interruptible(more.getAttribute('aria-expanded'), controller.signal) : null;
        expanded = state === 'true';
        if (options.expand !== false && !expansionAttempted && count === 1 && state === 'false' && await interruptible(more.isVisible(), controller.signal)) {
          expansionAttempted = true;
          await interruptible(more.click({ timeout: Math.max(1, Math.min(1500, expiresAt - Date.now())) }), controller.signal);
          fingerprint = '';
          await delay(interval, controller.signal);
          continue;
        }
        const next = JSON.stringify([best.text, best.sources]);
        if (next !== fingerprint) { fingerprint = next; unchangedSince = Date.now(); }
        else if (Date.now() - unchangedSince >= settleMs) return result(true);
      } else fingerprint = '';
      await delay(interval, controller.signal);
    }
  } catch (cause) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (controller.signal.aborted && controller.signal.reason === timeout) return result(false, true);
    if (cause instanceof GoogleSearchError) throw cause;
    throw new GoogleSearchError('Google Search browser observation failed', 'network', undefined, undefined, { cause });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
