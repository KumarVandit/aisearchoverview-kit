import { GoogleSearchClient } from '../google-search/client.js';
import { parseGoogleSearchMonitorHtml } from '../google-search/monitor.js';
import type { GoogleSearchMonitorResponse } from '../google-search/types.js';
import { AiSearchError, type AiSearchErrorKind } from '../errors.js';
import type { KitConfig, OverviewOptions, OverviewResult, ParseOverviewOptions, OverviewBatchOptions, OverviewBatchItem } from '../types.js';

function request(query: string, options: OverviewOptions, config: KitConfig) {
  return { query, country: options.country ?? config.locale?.country ?? 'US', hl: options.language ?? config.locale?.language ?? 'en', include: { aioverview: { markdown: options.markdown ?? true } } };
}

export function overviewResult(report: GoogleSearchMonitorResponse, query: string, options: OverviewOptions, config: KitConfig, snapshot = false): OverviewResult {
  if (!report.success && /^(?:VALIDATION|CONFIGURATION|NETWORK|HTTP|PARSE|TIMEOUT)_ERROR$/.test(report.error.code)) {
    const kind = report.error.code.replace('_ERROR', '').toLowerCase() as AiSearchErrorKind;
    throw new AiSearchError(report.error.message, kind, report.metadata.httpStatus);
  }
  const data = report.success ? report.result.aioverview : undefined;
  const base = {
    query,
    sources: (data?.sources ?? []).map(source => ({ position: source.position, title: source.label, url: source.url, ...(source.description ? { description: source.description } : {}), ...(source.redirectLink ? { redirectUrl: source.redirectLink } : {}) })),
    reason: report.metadata.aiOverview.reason ?? (!report.success ? report.error.message : 'Overview presence was not established.'),
    metadata: {
      country: options.country ?? config.locale?.country ?? 'US', language: options.language ?? config.locale?.language ?? 'en',
      transport: snapshot ? 'snapshot' as const : config.transport ?? 'embedded', durationMs: report.metadata.timing?.totalMs ?? 0,
      httpStatus: report.metadata.httpStatus, sourceUrl: report.metadata.sourceUrl, completeness: 'unverified' as const,
      warnings: report.metadata.warnings.filter(warning => !warning.startsWith('This is a supported subset of the Cloro-style')),
    },
  };
  if (data && report.metadata.aiOverview.status === 'present') return { ...base, status: 'present', text: data.text, ...(data.markdown !== undefined ? { markdown: data.markdown } : {}), ...(data.productLinks?.length ? { productLinks: data.productLinks.map(product => ({ ...product })) } : {}), ...(data.videos?.length ? { videos: data.videos.map(video => ({ ...video })) } : {}), ...(data.citationPills?.length ? { citationPills: data.citationPills.map(pill => ({ ...pill })) } : {}) };
  return { ...base, status: report.metadata.aiOverview.status === 'blocked' ? 'blocked' : 'unverified' };
}

export class OverviewNamespace {
  constructor(private readonly client: GoogleSearchClient, private readonly config: KitConfig, private readonly beforeGet?: () => void) {}

  /** Retrieves Google's actual Overview; blocked and unrecognized pages remain explicit results. */
  async get(query: string, options: OverviewOptions = {}): Promise<OverviewResult> {
    if (typeof query !== 'string' || !query.trim()) throw new AiSearchError('query must be a nonempty string', 'validation');
    this.beforeGet?.();
    const report = await this.client.monitor(request(query, options, this.config), { signal: options.signal });
    return overviewResult(report, query, options, this.config);
  }

  /** Extracts an Overview and literal HTML transfers without executing page scripts or making requests. */
  parse(html: string, options: ParseOverviewOptions): OverviewResult {
    let query = options.query;
    if (query === undefined) { try { query = new URL(options.sourceUrl).searchParams.get('q') ?? ''; } catch { throw new AiSearchError('Invalid sourceUrl', 'validation'); } }
    const report = parseGoogleSearchMonitorHtml(html, request(query, options, this.config), { sourceUrl: options.sourceUrl, query });
    return overviewResult(report, query, options, this.config, true);
  }

  /** Fetches queries with bounded concurrency and keeps per-query errors in input order. */
  async batch(queries: readonly string[], options: OverviewBatchOptions = {}): Promise<OverviewBatchItem[]> {
    if (!Array.isArray(queries) || queries.some(query => typeof query !== 'string' || !query.trim())) throw new AiSearchError('queries must be an array of nonempty strings', 'validation');
    const concurrency = options.concurrency ?? 2;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new AiSearchError('concurrency must be an integer from 1 to 8', 'validation');
    if (options.deduplicate !== undefined && typeof options.deduplicate !== 'boolean') throw new AiSearchError('deduplicate must be a boolean', 'validation');
    const results: OverviewBatchItem[] = new Array(queries.length);
    // This map lives only for this batch, including failures; it never caches later observations.
    const shared = options.deduplicate ? new Map<string, Promise<OverviewResult>>() : undefined;
    let next = 0;
    const worker = async () => {
      while (next < queries.length) {
        if (options.signal?.aborted) throw options.signal.reason;
        const index = next++;
        const query = queries[index]!;
        try {
          let pending = shared?.get(query);
          if (!pending) { pending = this.get(query, options); shared?.set(query, pending); }
          const overview = await pending;
          results[index] = { query, ok: true, overview: shared ? structuredClone(overview) : overview };
        }
        catch (error) {
          if (options.signal?.aborted) throw options.signal.reason;
          results[index] = { query, ok: false, error: { kind: error instanceof AiSearchError ? error.kind : 'unknown', message: error instanceof Error ? error.message : String(error) } };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queries.length) }, worker));
    return results;
  }
}
