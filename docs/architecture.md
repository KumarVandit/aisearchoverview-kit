# Architecture

The root SDK follows googlemaps-kit's client and namespace pattern, with an API centered on the user's task rather than a hosted monitoring platform.

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

This product was extracted from googlemaps-kit. Books and Gemini retain their generic HTML utility there; Search clients, fixtures, tests, documentation and the embedded helper belong here. The Maps package does not depend on this package or forward Search calls to it.
