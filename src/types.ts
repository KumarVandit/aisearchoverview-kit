export interface OverviewSource {
  position: number;
  title: string;
  url: string;
  /** Original Google redirect when its publisher destination is unresolved or was resolved separately. */
  redirectUrl?: string;
}

export interface OverviewMetadata {
  country: string;
  language: string;
  transport: 'embedded' | 'http' | 'snapshot';
  durationMs: number;
  httpStatus?: number;
  sourceUrl?: string;
  completeness: 'unverified';
  warnings: string[];
}

interface OverviewBase {
  query: string;
  sources: OverviewSource[];
  reason: string;
  metadata: OverviewMetadata;
}

export type OverviewResult = (OverviewBase & { status: 'present'; text: string; markdown?: string })
  | (OverviewBase & { status: 'blocked' | 'unverified'; text?: never; markdown?: never });

export interface OverviewOptions {
  country?: string;
  language?: string;
  /** Includes Markdown by default. */
  markdown?: boolean;
  signal?: AbortSignal;
}

export interface ParseOverviewOptions extends Omit<OverviewOptions, 'signal'> {
  sourceUrl: string;
  query?: string;
}

export interface OverviewBatchOptions extends OverviewOptions {
  /** Maximum in-flight queries, from 1 to 8. Defaults to 2. */
  concurrency?: number;
}

export type OverviewBatchItem = { query: string; ok: true; overview: OverviewResult }
  | { query: string; ok: false; error: { kind: string; message: string } };

export interface SourceResolutionResult {
  sources: OverviewSource[];
  resolved: number;
  warnings: string[];
}

export interface KitConfig {
  /** Embedded HTTP retrieval is the default; plain HTTP is useful with custom fetch implementations. */
  transport?: 'embedded' | 'http';
  locale?: { country?: string; language?: string };
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  bootstrapExecutable?: string;
  pythonExecutable?: string;
  cacheDirectory?: string;
}
