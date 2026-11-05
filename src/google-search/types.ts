export interface GoogleSearchConfig {
  fetch?: typeof globalThis.fetch;
  language?: string;
  country?: string;
  /** Request deadline, including response-body consumption. Defaults to 20000 ms. */
  timeoutMs?: number;
  page?: GoogleSearchBrowserPage;
}

/** Caller-owned browser interface; the SDK does not install a browser or read cookies. */
export interface GoogleSearchBrowserPage {
  url(): string;
  goto(url: string, options?: { waitUntil?: 'domcontentloaded'; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  locator(selector: string): GoogleSearchBrowserLocator;
}

export interface GoogleSearchBrowserLocator {
  count(): Promise<number>;
  isVisible(): Promise<boolean>;
  getAttribute(name: string): Promise<string | null>;
  click(options?: { timeout?: number }): Promise<void>;
}

export interface GoogleAiOverviewBrowserOptions {
  signal?: AbortSignal;
  language?: string;
  country?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  settleMs?: number;
  expand?: boolean;
}

export interface GoogleAiOverviewBrowserResponse extends GoogleAiOverview {
  query: string;
  sourceUrl: string;
  transport: 'browser';
  expanded: boolean;
  /** True after unchanged answer text and sources for the configured quiet period, not a server completion signal. */
  settled: boolean;
  timedOut: boolean;
}

export interface GoogleSearchOptions {
  signal?: AbortSignal;
  language?: string;
  country?: string;
  start?: number;
  safe?: 'active' | 'off';
  /** Retains the response for diagnosis when Google changes its markup. */
  includeRawHtml?: boolean;
}

export interface GoogleSuggestOptions {
  signal?: AbortSignal;
  language?: string;
  country?: string;
}

export interface GoogleSearchLink {
  title: string;
  url: string;
}

export interface GoogleOrganicResult extends GoogleSearchLink {
  position: number;
  snippet?: string;
  displayUrl?: string;
}

export interface GoogleAiOverview {
  status: 'present' | 'blocked' | 'unverified';
  /** Extracted visible text from an explicitly labeled overview region, when available. */
  text?: string;
  markdown?: string;
  citationPills?: GoogleAiOverviewCitationPill[];
  sources: GoogleSearchLink[];
  reason: string;
}

export interface GoogleAiOverviewCitationPill {
  citationPillId: number;
  position: number;
  label: string;
  url: string;
  domain: string;
}

export interface GoogleSearchMonitorRequest {
  query: string;
  country?: string;
  gl?: string;
  hl?: string;
  include?: {
    html?: false;
    rawHtml?: boolean;
    aioverview?: boolean | { markdown?: boolean };
  };
}

export interface GoogleSearchMonitorOptions {
  transport?: 'http' | 'browser';
  signal?: AbortSignal;
  browser?: Pick<GoogleAiOverviewBrowserOptions, 'timeoutMs' | 'pollIntervalMs' | 'settleMs' | 'expand'>;
}

export interface GoogleSearchMonitorSource {
  position: number;
  url: string;
  label: string;
  redirectLink?: string;
}

export interface GoogleSearchMonitorOverview {
  text: string;
  markdown?: string;
  sources: GoogleSearchMonitorSource[];
  citationPills?: GoogleAiOverviewCitationPill[];
}

export interface GoogleSearchMonitorResult {
  organicResults?: Array<{ position: number; title: string; link: string; displayedLink?: string; snippet?: string; redirectLink?: string }>;
  peopleAlsoAsk?: Array<{ question: string; type: 'UNKNOWN' }>;
  relatedSearches?: Array<{ query: string; link: string }>;
  aioverview?: GoogleSearchMonitorOverview;
}

export interface GoogleSearchMonitorMetadata {
  transport: 'http' | 'browser' | 'snapshot';
  query?: string;
  sourceUrl?: string;
  httpStatus?: number;
  retryAfterMs?: number;
  rawHtml?: string;
  timing?: {
    scope: 'request' | 'snapshot-processing';
    totalMs: number;
    /** Duration of the delegated Search/browser method, including its parsing or observation wait. */
    retrievalMs?: number;
  };
  searchStatus?: GoogleSearchStatus;
  aiOverview: { requested: boolean; status: GoogleAiOverview['status'] | 'not-requested'; reason?: string; completeness: 'unverified' };
  expanded?: boolean;
  settled?: boolean;
  timedOut?: boolean;
  warnings: string[];
}

export type GoogleSearchMonitorResponse = {
  success: true;
  result: GoogleSearchMonitorResult;
  metadata: GoogleSearchMonitorMetadata;
} | {
  success: false;
  error: { code: string; message: string; details?: Array<{ field: string; message: string }> };
  metadata: GoogleSearchMonitorMetadata;
};

export type GoogleSearchStatus = 'results' | 'empty' | 'blocked' | 'javascript-required' | 'consent-required' | 'unrecognized';

export interface GoogleSearchResponse {
  query: string;
  sourceUrl: string;
  httpStatus: number;
  status: GoogleSearchStatus;
  organic: GoogleOrganicResult[];
  relatedQuestions: string[];
  relatedSearches: Array<{ query: string; url: string }>;
  aiOverview: GoogleAiOverview;
  warnings: string[];
  retryAfterMs?: number;
  rawHtml?: string;
}

export interface GoogleAutocompleteResponse {
  query: string;
  suggestions: string[];
  raw: unknown[];
}

export interface ParseGoogleSearchOptions {
  sourceUrl: string;
  query?: string;
  httpStatus?: number;
  includeRawHtml?: boolean;
}
