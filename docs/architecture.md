# Architecture

The SDK uses a client and namespace API organized around retrieval, parsing, and batch collection.

| Module | Responsibility |
| --- | --- |
| `src/client.ts` | `sdk()` configuration and namespace wiring. |
| `src/types.ts`, `src/errors.ts` | User-facing result contracts and typed errors. |
| `src/namespaces/overview.ts` | Retrieve, parse and collect Overviews. |
| `src/namespaces/sources.ts` | Optional publisher-URL resolution. |
| `src/google-search/` | Internal Search transport, markup and literal-transfer parsing. |
| `src/transport/embedded.ts` | Bounded subprocess bridge for the HTTP driver. |
| `runtime/` | Pinned Python HTTP driver and its offline tests. |
| `src/runtime.ts` | Explicit dependency setup and cache paths. |
| `tools/google-search-bootstrap/` | Native adapter source and reproducible engine build. |
| `src/advanced.ts` | Low-level controls for users who need them. |
| `src/cli.ts` | Terminal entry for setup, retrieval and saved HTML. |

The internal parser never generates a substitute answer. It associates recognized Overview markup with answer text and source cards, excludes controls and notices, and statically decodes supported literal HTML transfers. Unknown layouts remain unverified. The separate native helper executes the recognized session bootstrap, not the answer extraction logic, and has no network broker.

No hosted account platform, API-key billing, unrelated AI engines or remote task queue is implied. The internal monitoring-envelope converters remain available through `advanced` for existing integrations, but they do not define the main SDK. Browser-backed adapters are optional advanced controls; no browser dependency is installed.

