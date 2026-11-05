import { existsSync } from 'node:fs';
import { GoogleSearchClient } from './google-search/client.js';
import { embeddedSearchFetch } from './transport/embedded.js';
import { runtimePaths } from './runtime.js';
import { AiSearchError } from './errors.js';
import { OverviewNamespace } from './namespaces/overview.js';
import { SourcesNamespace } from './namespaces/sources.js';
import type { KitConfig } from './types.js';

export class AiSearchOverviewClient {
  readonly overview: OverviewNamespace;
  readonly sources: SourcesNamespace;

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
    const normalized = { ...config, transport };
    this.overview = new OverviewNamespace(new GoogleSearchClient({ fetch: fetcher, timeoutMs }), normalized, beforeGet);
    this.sources = new SourcesNamespace(config.fetch ?? globalThis.fetch, timeoutMs);
  }
}

export function sdk(config: KitConfig = {}): AiSearchOverviewClient { return new AiSearchOverviewClient(config); }
