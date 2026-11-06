export interface OverviewSource {
  description?: string;
  position: number;
  title: string;
  url: string;
  /** Original Google redirect when its publisher destination is unresolved or was resolved separately. */
  redirectUrl?: string;
}

export interface OverviewCitationPill {
  description?: string;
  citationPillId: number;
  /** One-based position in the sources array; not a sentence offset. */
  position: number;
  label: string;
  url: string;
  domain: string;
}

export interface OverviewProductLink {
  position: number;
  title: string;
  /** Google product viewer; not a merchant URL or provider-issued product token. */
  url: string;
  productDocid: string;
}

export interface OverviewVideo {
  url: string;
  title?: string;
  thumbnail?: string;
  source?: string;
  platform?: string;
  date?: string;
  duration?: string;
  channel?: string;
  startTimeSeconds?: number;
  segmentDurationSeconds?: number;
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

export type OverviewResult = (OverviewBase & { status: 'present'; text: string; markdown?: string; citationPills?: OverviewCitationPill[]; videos?: OverviewVideo[]; productLinks?: OverviewProductLink[] })
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
  /** Reuse identical queries within this batch only; defaults to false. */
  deduplicate?: boolean;
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
  /** Optional pacing and denial cooldown shared by this client’s Search and Overview requests. */
  traffic?: import('./transport/coordinator.js').TrafficOptions;
  /** Embedded HTTP retrieval is the default; plain HTTP is useful with custom fetch implementations. */
  transport?: 'embedded' | 'http';
  locale?: { country?: string; language?: string };
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  bootstrapExecutable?: string;
  pythonExecutable?: string;
  cacheDirectory?: string;
}
