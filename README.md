# AI Search Overview Kit

A TypeScript SDK and terminal command for **actual Google AI Overview answers**: text, Markdown, citations and explicit access states. Use it to collect answers, track cited publishers, compare queries, or parse saved Search HTML.

```sh
npm install aisearchoverview-kit
npx aisearchoverview-kit setup
```

Setup requires Git, Rust 1.91+ and Python 3.10+. It builds a pinned embedded JavaScript/DOM runtime and installs a pinned HTTP client in your user cache. npm installation and SDK imports do not run setup automatically. The working HTTP method launches no Chrome, Playwright or browser application; its embedded library still contains browser-engine DOM/CSS/layout code. Google can block individual sessions.

## Get an Overview

```ts
import { sdk } from 'aisearchoverview-kit';

const search = sdk();
const answer = await search.overview.get('why is the sky blue', {
  country: 'US', language: 'en',
});

if (answer.status === 'present') {
  console.log(answer.text);
  console.log(answer.markdown);
  for (const source of answer.sources) {
    console.log(source.position, source.title, source.url);
  }
} else {
  console.log(answer.status, answer.reason);
}
```

CommonJS is supported with `const { sdk } = require('aisearchoverview-kit')`.

## Purpose-based methods

| Method | Purpose |
| --- | --- |
| `overview.get(query, options?)` | Retrieve one actual Google Overview. |
| `overview.parse(html, options)` | Extract text and sources from saved HTML, without requests or script execution. |
| `overview.batch(queries, options?)` | Collect several queries with bounded concurrency and individual error results. |
| `sources.resolve(sources, options?)` | Resolve Google's citation redirects without fetching publisher pages. |
| `setupRuntime(options?)` | Prepare the optional local HTTP/runtime dependencies. |

```ts
const batch = await search.overview.batch([
  'why is the sky blue',
  'why do leaves change color in autumn',
], { country: 'US', concurrency: 2 });

const saved = search.overview.parse(html, {
  sourceUrl: 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us',
});

if (saved.status === 'present') {
  const resolved = await search.sources.resolve(saved.sources);
  console.log(resolved.sources);
}
```

`present` means answer text was established. `blocked` means a recognized access challenge. `unverified` means presence could not be established; it never means confirmed absence. Argument, setup and transport failures throw `AiSearchError` with a typed `kind`. Batch collection preserves each query's error and input order. There are no automatic traffic-challenge retries.

## Terminal

```sh
npx aisearchoverview-kit setup --python python3.11
npx aisearchoverview-kit get "why is the sky blue" --country US
npx aisearchoverview-kit get "why is the sky blue" --resolve-sources
npx aisearchoverview-kit parse saved.html --url "https://www.google.com/search?q=example"
```

Commands print JSON. `get`/`parse` exit 0 for a present answer, 2 for a blocked or unverified result, and 1 for an error. Setup/build logs go to stderr. [Runtime details](docs/runtime.md) explain cache and executable overrides.

## Package structure

| Entry | Use |
| --- | --- |
| `aisearchoverview-kit` | `sdk()`, Overview/source namespaces, public result types and typed errors. |
| `aisearchoverview-kit/advanced` | Low-level Search client, parsers, optional caller-owned browser adapter and monitoring-envelope converters. |

The main API is focused on Google AI Overviews. AI Mode, ChatGPT, Gemini and other providers are not implemented by this package. Cloro's public interfaces informed the request/response review; this package has its own implementation and purpose-based SDK, with no Cloro API calls or platform dependency. [Comparison](docs/cloro-comparison.md).

## Verification and limits

The existing engine path was live-verified without a browser application. Earlier end-to-end command measurements returned sky in **1.26 s** with 7 sources and autumn leaves in **1.74 s** with 6 sources. These are individual observations; results, citations, eligibility and response times vary. Subsequent traffic failures are recorded in the [research ledger](docs/google-search-browserless-research.md).

Expanded literal HTML transfers are decoded statically; response scripts are not executed by the answer parser. The separate native helper executes only the recognized session bootstrap and has no HTTP broker. Answer completeness remains unverified. Unresolved Google redirect URLs remain explicit until `sources.resolve()` is requested.

```sh
npm ci
npm run build
npm run type-check
npm test
```

Default tests are offline. `npm run test:live` opts into network probes; an access-state observation is not a successful Overview benchmark. Python driver tests use `python runtime/test_fetch.py` in an environment with the pinned HTTP client installed. Native input tests are available through Cargo after setup/source preparation.

[Layout coverage audit](docs/layout-coverage.md) · [API and types](docs/api.md) · [Architecture](docs/architecture.md) · [Advanced controls](docs/advanced.md) · [Research evidence](docs/google-search-research.md)

MIT for this SDK and adapter. The fetched engine, HTTP client and Rust dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). No Google affiliation is implied.
