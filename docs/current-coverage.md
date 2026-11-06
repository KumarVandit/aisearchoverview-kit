# Current development coverage





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

