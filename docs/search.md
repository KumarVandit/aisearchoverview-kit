# Search results alongside the Overview

`search.get(query, options?)` collects the supported surrounding Search fields and the AI Overview from one response. `search.parse(html, { sourceUrl, query?, ...options })` applies the same adapter to supplied HTML without requests or script execution. The public namespace uses the kit's configured HTTP/embedded transport and locale defaults.

```ts
const response = await sdk().search.get('induction vs gas cooktops', {
  country: 'US',
  language: 'en',
  markdown: true,
});
if (response.success) {
  console.log(response.result.organicResults);
  console.log(response.result.peopleAlsoAsk);
  console.log(response.result.relatedSearches);
  console.log(response.result.aioverview);
} else {
  console.log(response.error.code, response.metadata.searchStatus);
}
```

The result retains the existing typed monitoring envelope (`SearchResult`): `success`, `result` or `error`, and `metadata`. A readable Search response can succeed without `aioverview`; `metadata.aiOverview.status` remains `unverified` rather than confirmed absent. Recognized access challenges return a failed envelope with `BLOCKED`. Invalid arguments, setup problems and transport failures throw `AiSearchError`, matching the main Overview namespace. Caller cancellation preserves the original abort reason.

`SearchOptions` supports `country`, `language`, `markdown`, `signal` and opt-in `rawHtml`. Snapshot parsing additionally accepts `query` and `httpStatus`. The original response HTML appears only when explicitly requested. Raw responses can contain request/session data; keep diagnostic captures private.

This is a supported subset of Search features. Organic titles/links/snippets, structurally recognized People Also Ask questions and related searches are available; PAA answer bodies are not implemented. Empty arrays mean nothing was extracted from that supplied response, not a guarantee that the live rendered page had no such module. Surrounding shopping grids, Knowledge Graph, local packs, recipes and sponsored SERP ads are not supported by this namespace. Assets belonging to the Overview remain under `result.aioverview` and must not be conflated with surrounding results.


## Resolve publisher links in the combined response

```ts
const response = await sdk().search.get('how does intermittent fasting work', {
  country: 'US',
  language: 'en',
  location: 'Austin,Texas,United States',
  device: 'desktop',
  resolveSources: true,
});
```

This returns the Overview with its citations and the supported organic results. Google citation and organic redirect links are resolved together; the originals remain in `redirectLink`. `metadata.resolution` reports attempted/resolved/unresolved URL counts and resolution duration. `metadata.timing.totalMs` includes retrieval, parsing, and URL resolution.

Google may require a timed verification step before disclosing a publisher URL. The resolver reads explicit redirect targets and literal Continue timers without executing page scripts. It respects those waits; it never requests publisher pages, solves CAPTCHAs or retries access denials. Unresolved links remain explicit and produce warnings.

Resolution defaults to four active lookups, at least 500 ms between starts, and a 60-second per-link deadline unless `sdk({ timeoutMs })` sets another value. `resolutionConcurrency`, `resolutionMinIntervalMs`, and `resolutionTimeoutMs` can override these settings for this call. Waiting for a Google navigation timer does not occupy an active lookup slot. Standalone `sources.resolve()` accepts the corresponding `concurrency`, `minIntervalMs`, and `timeoutMs` options. Cookies come only from the operation's Google responses, remain in memory, and are never returned or sent to publishers.

`location` accepts a canonical `City,Region,Country` string up to 63 UTF-8 bytes and encodes a UULE hint. It does not change or verify the machine's IP location. `device: 'desktop'` denotes the native runtime's 1024×768 desktop-style profile; it does not launch or impersonate Chrome. Mobile profiles are unsupported. These settings are supported by HTTP/embedded retrieval, not the optional caller-owned browser adapter.

For an explicitly live three-run local benchmark:

```sh
npx tsx scripts/benchmark-search.ts --live --output .probe/search-benchmark.json
```

The benchmark counts only responses with actual Overview text, citation publisher URLs, and organic publisher URLs as complete. Runtime installation is excluded. It uses fresh per-call HTTP sessions and no SDK answer cache; Google may still cache upstream responses.
