# Current development coverage

These changes are unreleased. The target is Google's Overview and AI Mode, including follow-up conversations. Full Cloro parity has **not** been achieved.

| Surface | Working evidence | Remaining boundary |
| --- | --- | --- |
| `overview.get/parse/batch` | Actual HTTP Overviews; Markdown, sources, citation groups and source descriptions | Eligibility and generation completeness remain unverified |
| Overview videos | Three actual comparison cards with title, URL, channel, date and duration/segment timing | Only recognized YouTube card markup; source-rail links are not inline cards |
| Overview product references | Eleven actual shopping viewer links, separated from citations | These are not merchant offers, prices or Cloro product-result tokens |
| `search.get/parse` | Supported surrounding organic results, PAA, related searches and AIO in one response | Full surrounding SERP modules are incomplete |
| `aiMode.parse` | Two actual conversation turns; each retains six place cards and six image URLs, with prompt, price/category/status, ratings, websites and directions | Saved DOM, not a live conversation transport; map coordinates/phone/place IDs omitted when absent |
| `aiMode.get` | Explicit AI Mode request and honest error/access states | Anonymous probes downgraded to Search or met a Google challenge; no successful live AI Mode response |
| AI Mode follow-up sending | Browser behavior and separate initial/follow-up routes observed | No working browser-free conversation implementation yet |
| Related-link widgets, ads, maps and advanced shopping | Primary Cloro contracts recorded | Missing capture-backed implementations; no universal UI/asset claim |

Real Markdown regressions cover code whitespace, tables, inline product links and list ownership. Preview generation uses GFM rendering to catch errors that plain-text equality misses:

```sh
npx tsx scripts/preview-layouts.ts --output .probe/layout-preview
```

Open the generated `index.html` to compare Markdown source and rendered content. This is a fixture preview, not a Google pixel clone. Public image references may expire and some fixtures deliberately remove payloads. Browser locale parameters are hints; the existing signed-in browser is not proof of a US network location.

## Traffic controls

```ts
const client = sdk({
  traffic: { maxConcurrent: 2, minIntervalMs: 1000, cooldownMs: 60_000 },
});
const results = await client.overview.batch(queries, {
  concurrency: 2,
  deduplicate: true,
});
```

Pacing is opt-in and shared across this client's Overview, Search and experimental AI Mode fetches. It limits SDK fetch starts, not the driver's two or three internal upstream exchanges. It does not coordinate different client instances, processes or machines. An observed denial pauses new requests; Retry-After can extend that pause. It does not retry the denied request. Some intermediate runtime failures remain generic and cannot yet be classified by this layer.

Deduplication is opt-in, exact-query, and limited to one batch. It preserves result order and independent output objects. It does not introduce a persistent answer cache or silently change cross-batch freshness. In the measured four-query repeated workload it can reduce 100 scheduled fetches to four; this is workload-specific, not a universal saving.

The [100-call live audit](scale-audit.md) found no blocking at its tested load. It did not establish an IP quota, discover Google's detection mechanism, or prove sustained production reliability. The [AI Mode protocol ledger](ai-mode-protocol.md) records separate session/delivery failures. Those failures must not be attributed to an IP limit without a controlled comparison.
