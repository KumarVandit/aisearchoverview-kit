# Supported features and limits

| Feature | Support | Limits |
| --- | --- | --- |
| `overview.get/parse/batch` | Answer text, Markdown, sources, citation groups and source descriptions | Availability varies; completeness remains unverified |
| Rendered Overview layouts | Recognized labelled layouts, source cards and local property names within answer text | Hidden answer text and citation buttons without destinations are not reconstructed; parsing rendered HTML does not implement deferred retrieval |
| Overview videos | Recognized YouTube cards, titles, links, channels and timing | Other video layouts may be omitted |
| Overview product references | Google product-viewer links | Merchant offers and prices are not provided |
| `search.get/parse` | Organic results, People Also Ask questions, related searches and Overview | Full Search page coverage is not supported |
| `aiMode.parse` | Saved conversation turns, prompts, sources, place cards and images | Fields are included only when present in the supplied HTML |
| `aiMode.get` | Experimental retrieval with explicit access states | Successful live retrieval is not verified |
| AI Mode follow-up sending | Not supported | Use saved conversation parsing |
| Ads, maps and advanced shopping | Not supported | No complete rendering or asset coverage guarantee |

Markdown supports recognized code blocks, tables, lists and inline links. Asset URLs are references and may expire. Unrecognized layouts return an unverified state; missing fields do not establish that a feature was absent from the rendered page.

## Traffic controls

```ts
import { sdk } from 'aisearchoverview-kit';

const client = sdk({
  traffic: { maxConcurrent: 2, minIntervalMs: 1000, cooldownMs: 60_000 },
});
const results = await client.overview.batch(queries, {
  concurrency: 2,
  deduplicate: true,
});
```

Pacing is opt-in and shared across one client's Overview, Search and experimental AI Mode requests. It limits SDK request starts; a request can involve multiple upstream HTTP exchanges. It does not coordinate separate clients, processes or machines. Recognized access denials pause new requests, and Retry-After can extend that pause. Denied requests are not automatically retried. Some runtime failures are reported as generic network errors.

Deduplication is opt-in, uses exact query strings, and applies within one batch. Results retain input order and independent output objects. There is no persistent answer cache.
