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

The captured simplified Overview regression verifies one-response plumbing using a real sanitized AIO subtree, which intentionally has no surrounding organic results. The combined organic/PAA/related-search regression is explicitly synthetic. Consult the layout and parity reports for the separate live evidence boundary.
