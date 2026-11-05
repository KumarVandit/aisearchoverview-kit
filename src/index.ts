export { sdk, AiSearchOverviewClient } from './client.js';
export { AiSearchError } from './errors.js';
export type { AiSearchErrorKind } from './errors.js';
export { setupRuntime, runtimePaths } from './runtime.js';
export type { RuntimePaths, SetupOptions } from './runtime.js';
export type * from './types.js';
export { OverviewNamespace } from './namespaces/overview.js';
export { SourcesNamespace } from './namespaces/sources.js';

export { AiModeNamespace } from './namespaces/ai-mode.js';
export type * from './ai-mode/types.js';
export { SearchNamespace } from './namespaces/search.js';
export type { SearchOptions, ParseSearchOptions, SearchResult } from './namespaces/search.js';
export type { TrafficOptions } from './transport/coordinator.js';
