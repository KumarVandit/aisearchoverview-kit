import { GoogleSearchClient } from './google-search/client.js';
import { coordinatedSearchFetch } from './transport/coordinator.js';
import { OverviewNamespace } from './namespaces/overview.js';
import { SearchNamespace } from './namespaces/search.js';
import { SourcesNamespace } from './namespaces/sources.js';
import { AiModeNamespace } from './namespaces/ai-mode.js';
import { AiSearchError } from './errors.js';
import type { KitConfig } from './types.js';

export type WorkerKitConfig = Pick<KitConfig, 'fetch' | 'locale' | 'timeoutMs' | 'traffic'> & { transport?: 'http' };

/** Fetch-only client. Runtime compatibility does not establish Google Overview availability. */
export class WorkersAiSearchOverviewClient {
  readonly overview: OverviewNamespace;
  readonly search: SearchNamespace;
  readonly sources: SourcesNamespace;
  readonly aiMode: AiModeNamespace;

  constructor(config: WorkerKitConfig = {}) {
    if (config.transport !== undefined && config.transport !== 'http') throw new AiSearchError('The Workers entry point supports only HTTP transport', 'configuration');
    const timeoutMs = config.timeoutMs ?? 20_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new AiSearchError('timeoutMs must be a positive bounded number', 'configuration');
    const fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
    const coordinated = coordinatedSearchFetch(fetcher, config.traffic);
    const normalized = { ...config, transport: 'http' as const };
    const client = new GoogleSearchClient({ fetch: coordinated, timeoutMs });
    this.overview = new OverviewNamespace(client, normalized);
    this.search = new SearchNamespace(client, normalized);
    this.sources = new SourcesNamespace(fetcher, timeoutMs);
    this.aiMode = new AiModeNamespace(coordinated, normalized);
  }
}

export function sdk(config: WorkerKitConfig = {}): WorkersAiSearchOverviewClient {
  return new WorkersAiSearchOverviewClient(config);
}
export { AiSearchError } from './errors.js';
export type * from './types.js';
export type * from './ai-mode/types.js';
export type { SearchOptions, ParseSearchOptions, SearchResult } from './namespaces/search.js';
