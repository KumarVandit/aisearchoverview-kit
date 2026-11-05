import { GoogleSearchError } from './errors.js';
import { parseGoogleSearchHtml } from './parsers.js';
import type {
  GoogleAiOverview, GoogleAiOverviewBrowserOptions, GoogleAiOverviewBrowserResponse,
  GoogleSearchMonitorMetadata, GoogleSearchMonitorOptions, GoogleSearchMonitorOverview,
  GoogleSearchMonitorRequest, GoogleSearchMonitorResponse, GoogleSearchMonitorResult,
  GoogleSearchOptions, GoogleSearchResponse, ParseGoogleSearchOptions,
} from './types.js';

class ValidationError extends TypeError {
  constructor(readonly details: Array<{ field: string; message: string }>) {
    super('Request validation failed');
  }
}

interface NormalizedRequest {
  query: string;
  country: string;
  language?: string;
  overview: boolean;
  markdown: boolean;
  rawHtml: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: unknown): NormalizedRequest {
  const details: Array<{ field: string; message: string }> = [];
  const issue = (field: string, message: string) => details.push({ field, message });
  if (!record(value)) throw new ValidationError([{ field: 'body', message: 'Expected a JSON object' }]);
  for (const field of Object.keys(value)) if (!['query', 'country', 'gl', 'hl', 'include'].includes(field)) issue(field, 'Unsupported field');
  if (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 10_000) issue('query', 'Expected a nonempty string of at most 10000 characters');
  if (value.country !== undefined && (typeof value.country !== 'string' || !/^[A-Z]{2}$/.test(value.country))) issue('country', 'Expected an uppercase two-letter country code');
  if (value.gl !== undefined && (typeof value.gl !== 'string' || !/^[a-z]{2}$/i.test(value.gl))) issue('gl', 'Expected a two-letter country code');
  if (value.country === undefined && value.gl === undefined) issue('country', 'Provide country or gl');
  if (typeof value.country === 'string' && typeof value.gl === 'string' && value.country.toLowerCase() !== value.gl.toLowerCase()) issue('gl', 'Must agree with country when both are supplied');
  if (value.hl !== undefined && (typeof value.hl !== 'string' || value.hl.length > 35 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.hl))) issue('hl', 'Expected a Google language code');
  let overview = false, markdown = false, rawHtml = false;
  if (value.include !== undefined) {
    if (!record(value.include)) issue('include', 'Expected an object');
    else {
      for (const field of Object.keys(value.include)) if (!['html', 'rawHtml', 'aioverview'].includes(field)) issue(`include.${field}`, 'Unsupported field');
      if (value.include.html !== undefined && value.include.html !== false) issue('include.html', 'Hosted HTML export is unsupported; only false is accepted');
      if (value.include.rawHtml !== undefined && typeof value.include.rawHtml !== 'boolean') issue('include.rawHtml', 'Expected a boolean');
      rawHtml = value.include.rawHtml === true;
      const aio = value.include.aioverview;
      if (typeof aio === 'boolean') overview = aio;
      else if (record(aio)) {
        overview = true;
        for (const field of Object.keys(aio)) if (field !== 'markdown') issue(`include.aioverview.${field}`, 'Unsupported field');
        if (aio.markdown !== undefined && typeof aio.markdown !== 'boolean') issue('include.aioverview.markdown', 'Expected a boolean');
        markdown = aio.markdown === true;
      } else if (aio !== undefined) issue('include.aioverview', 'Expected a boolean or an object with an optional markdown flag');
    }
  }
  if (details.length) throw new ValidationError(details);
  return { query: value.query as string, country: String(value.country ?? value.gl).toLowerCase(), language: value.hl as string | undefined, overview, markdown, rawHtml };
}

function redirectLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    const opaque = url.pathname === '/url' && url.searchParams.get('uoh') === '3' && /^CAES[A-Za-z0-9_-]+$/.test(url.searchParams.get('q') ?? '');
    return ['www.google.com', 'google.com'].includes(url.hostname) && (url.pathname === '/goto' || opaque) ? value : undefined;
  } catch { return undefined; }
}

function overviewResult(overview: GoogleAiOverview, markdown: boolean): GoogleSearchMonitorOverview {
  return {
    text: overview.text ?? '',
    ...(markdown && overview.markdown !== undefined ? { markdown: overview.markdown } : {}),
    sources: overview.sources.map((source, index) => ({ position: index + 1, url: source.url, label: source.title, ...(redirectLink(source.url) ? { redirectLink: source.url } : {}) })),
    ...(overview.citationPills?.length ? { citationPills: overview.citationPills.map(pill => ({ ...pill })) } : {}),
  };
}

function metadata(request: NormalizedRequest | undefined, transport: GoogleSearchMonitorMetadata['transport'], overview?: GoogleAiOverview): GoogleSearchMonitorMetadata {
  return {
    transport,
    ...(request ? { query: request.query } : {}),
    aiOverview: {
      requested: request?.overview ?? false,
      status: request?.overview ? overview?.status ?? 'unverified' : 'not-requested',
      ...(request?.overview && overview ? { reason: overview.reason } : {}),
      completeness: 'unverified',
    },
    warnings: ['This is a supported subset of the Cloro-style contract, not Cloro backend or retrieval parity.', 'Unextracted fields are omitted; source redirect destinations and answer completeness are not verified.'],
  };
}

function failure(error: unknown, meta: GoogleSearchMonitorMetadata): GoogleSearchMonitorResponse {
  if (error instanceof GoogleSearchError) {
    if (error.status !== undefined) meta.httpStatus = error.status;
    if (error.retryAfterMs !== undefined) meta.retryAfterMs = error.retryAfterMs;
  }
  if (error instanceof ValidationError) return { success: false, error: { code: 'VALIDATION_ERROR', message: error.message, details: error.details }, metadata: meta };
  const code = error instanceof GoogleSearchError ? `${error.kind.toUpperCase()}_ERROR` : 'CONFIGURATION_ERROR';
  return { success: false, error: { code, message: error instanceof Error ? error.message : 'Google Search failed' }, metadata: meta };
}

function format(response: GoogleSearchResponse, request: NormalizedRequest, transport: 'http' | 'snapshot'): GoogleSearchMonitorResponse {
  const meta: GoogleSearchMonitorMetadata = { ...metadata(request, transport, response.aiOverview), query: response.query, sourceUrl: response.sourceUrl, httpStatus: response.httpStatus, searchStatus: response.status };
  if (response.retryAfterMs !== undefined) meta.retryAfterMs = response.retryAfterMs;
  if (request.rawHtml && response.rawHtml !== undefined) meta.rawHtml = response.rawHtml;
  if (request.rawHtml && response.rawHtml === undefined) meta.warnings.push('Raw HTML was requested but is unavailable in the supplied response.');
  meta.warnings.push(...response.warnings);
  if (!['results', 'empty'].includes(response.status)) return { success: false, error: { code: response.status.replaceAll('-', '_').toUpperCase(), message: `Google Search returned ${response.status}; no successful retrieval is claimed.` }, metadata: meta };
  const result: GoogleSearchMonitorResult = {
    organicResults: response.organic.map(item => ({ position: item.position, title: item.title, link: item.url, ...(item.displayUrl ? { displayedLink: item.displayUrl } : {}), ...(item.snippet ? { snippet: item.snippet } : {}), ...(redirectLink(item.url) ? { redirectLink: item.url } : {}) })),
    peopleAlsoAsk: response.relatedQuestions.map(question => ({ question, type: 'UNKNOWN' })),
    relatedSearches: response.relatedSearches.map(item => ({ query: item.query, link: item.url })),
    ...(request.overview && response.aiOverview.status === 'present' ? { aioverview: overviewResult(response.aiOverview, request.markdown) } : {}),
  };
  return { success: true, result, metadata: meta };
}

/** Converts an existing Search response into the supported monitoring response shape without making requests. */
export function formatGoogleSearchMonitorResponse(response: GoogleSearchResponse, request: GoogleSearchMonitorRequest): GoogleSearchMonitorResponse {
  const start = performance.now();
  let report: GoogleSearchMonitorResponse;
  try { report = format(response, normalize(request), 'snapshot'); }
  catch (error) { report = failure(error, metadata(undefined, 'snapshot')); }
  return withTiming(report, start, 'snapshot-processing');
}

/** Extracts monitoring data from supplied HTML; it never fetches, executes scripts or infers absent Overviews. */
export function parseGoogleSearchMonitorHtml(html: string, request: GoogleSearchMonitorRequest, options: ParseGoogleSearchOptions): GoogleSearchMonitorResponse {
  const start = performance.now();
  let normalized: NormalizedRequest | undefined;
  let report: GoogleSearchMonitorResponse;
  try {
    normalized = normalize(request);
    const source = new URL(options.sourceUrl);
    if (source.searchParams.has('q') && source.searchParams.get('q') !== normalized.query) throw new ValidationError([{ field: 'query', message: 'Must match the supplied source URL query' }]);
    report = format(parseGoogleSearchHtml(html, { ...options, includeRawHtml: normalized.rawHtml, query: normalized.query }), normalized, 'snapshot');
  } catch (error) { report = failure(error, metadata(normalized, 'snapshot')); }
  return withTiming(report, start, 'snapshot-processing');
}

function withTiming(response: GoogleSearchMonitorResponse, start: number, scope: 'request' | 'snapshot-processing', retrievalMs?: number): GoogleSearchMonitorResponse {
  response.metadata.timing = { scope, totalMs: Math.max(0, performance.now() - start), ...(retrievalMs === undefined ? {} : { retrievalMs }) };
  return response;
}

interface MonitorClient {
  search(query: string, options?: GoogleSearchOptions): Promise<GoogleSearchResponse>;
  aiOverview(query: string, options?: GoogleAiOverviewBrowserOptions): Promise<GoogleAiOverviewBrowserResponse>;
}

export async function requestGoogleSearchMonitor(client: MonitorClient, request: GoogleSearchMonitorRequest, options: GoogleSearchMonitorOptions = {}): Promise<GoogleSearchMonitorResponse> {
  const start = performance.now();
  let retrievalStart: number | undefined;
  let retrievalMs: number | undefined;
  let normalized: NormalizedRequest | undefined;
  const transport = options.transport === 'browser' ? 'browser' : 'http';
  const finish = (response: GoogleSearchMonitorResponse) => withTiming(response, start, 'request', retrievalMs);
  try {
    if (options.signal?.aborted) throw options.signal.reason;
    normalized = normalize(request);
    if (options.transport !== undefined && options.transport !== 'http' && options.transport !== 'browser') throw new ValidationError([{ field: 'transport', message: 'Expected http or browser' }]);
    if (transport === 'http' && options.browser !== undefined) throw new ValidationError([{ field: 'browser', message: 'Browser options require browser transport' }]);
    const locale = { language: normalized.language, country: normalized.country, signal: options.signal };
    if (transport === 'http') {
      retrievalStart = performance.now();
      const response = await client.search(normalized.query, { ...locale, includeRawHtml: normalized.rawHtml });
      retrievalMs = performance.now() - retrievalStart;
      return finish(format(response, normalized, 'http'));
    }
    if (!normalized.overview) throw new ValidationError([{ field: 'include.aioverview', message: 'Browser transport currently supports Overview-only requests; enable aioverview' }]);
    if (normalized.rawHtml) throw new ValidationError([{ field: 'include.rawHtml', message: 'Original raw HTML export is supported only by HTTP and snapshot transport' }]);
    retrievalStart = performance.now();
    const snapshot = await client.aiOverview(normalized.query, { ...options.browser, ...locale });
    retrievalMs = performance.now() - retrievalStart;
    const meta = { ...metadata(normalized, 'browser', snapshot), sourceUrl: snapshot.sourceUrl, expanded: snapshot.expanded, settled: snapshot.settled, timedOut: snapshot.timedOut };
    meta.warnings.push('Browser monitoring currently extracts only the Overview; organicResults, peopleAlsoAsk and relatedSearches are omitted.');
    if (snapshot.status !== 'present') return finish({ success: false, error: { code: snapshot.status === 'blocked' ? 'BLOCKED' : snapshot.timedOut ? 'TIMEOUT_ERROR' : 'OVERVIEW_UNVERIFIED', message: snapshot.reason }, metadata: meta });
    return finish({ success: true, result: { aioverview: overviewResult(snapshot, normalized.markdown) }, metadata: meta });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (retrievalStart !== undefined && retrievalMs === undefined) retrievalMs = performance.now() - retrievalStart;
    return finish(failure(error, metadata(normalized, transport)));
  }
}

export function googleSearchMonitorHttpStatus(response: GoogleSearchMonitorResponse): number {
  return response.success ? 200 : response.error.code === 'VALIDATION_ERROR' ? 400 : response.error.code === 'TIMEOUT_ERROR' ? 504 : 502;
}
