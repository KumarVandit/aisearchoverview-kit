import { coordinatedSearchFetch } from './transport/coordinator.js';
import { existsSync } from 'node:fs';
import { GoogleSearchClient } from './google-search/client.js';
import { embeddedSearchFetch } from './transport/embedded.js';
import { runtimePaths } from './runtime.js';
import { AiSearchError } from './errors.js';
import { OverviewNamespace } from './namespaces/overview.js';
import { SearchNamespace } from './namespaces/search.js';
import { AiModeNamespace } from './namespaces/ai-mode.js';
import { SourcesNamespace } from './namespaces/sources.js';
import type { KitConfig } from './types.js';

export class AiSearchOverviewClient {
  readonly overview: OverviewNamespace;
  readonly search: SearchNamespace;
  readonly sources: SourcesNamespace;
  readonly aiMode: AiModeNamespace;

  constructor(config: KitConfig = {}) {
    if (config.transport !== undefined && !['embedded', 'http'].includes(config.transport)) throw new AiSearchError('transport must be embedded or http', 'configuration');
    const timeoutMs = config.timeoutMs ?? 20_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new AiSearchError('timeoutMs must be a positive bounded number', 'configuration');
    const transport = config.transport ?? (config.fetch ? 'http' : 'embedded');
    let beforeGet: (() => void) | undefined;
    let fetcher = config.fetch ?? globalThis.fetch;
    if (!config.fetch && transport === 'embedded') {
      const paths = runtimePaths(config.cacheDirectory);
      const bootstrapExecutable = config.bootstrapExecutable ?? paths.bootstrapExecutable;
      const pythonExecutable = config.pythonExecutable ?? paths.pythonExecutable;
      const embedded = embeddedSearchFetch({ bootstrapExecutable, pythonExecutable });
      beforeGet = () => {
        if (!existsSync(bootstrapExecutable) || !existsSync(pythonExecutable)) throw new AiSearchError('Runtime not installed. Run: npx aisearchoverview-kit setup', 'configuration');
      };
      fetcher = embedded;
    }
    fetcher = coordinatedSearchFetch(fetcher, config.traffic);
    const normalized = { ...config, transport };
    const searchClient = new GoogleSearchClient({ fetch: fetcher, timeoutMs });
    this.overview = new OverviewNamespace(searchClient, normalized, beforeGet);
    this.sources = new SourcesNamespace(config.fetch ?? globalThis.fetch, config.timeoutMs ?? 60_000);
    this.search = new SearchNamespace(searchClient, normalized, beforeGet, this.sources);
    this.aiMode = new AiModeNamespace(fetcher, normalized, beforeGet);

  }
}

export function sdk(config: KitConfig = {}): AiSearchOverviewClient { return new AiSearchOverviewClient(config); }
