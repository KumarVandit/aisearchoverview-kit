# Cloro interface review

Reviewed November 5, 2026 against Cloro's [Google Search request](https://cloro.dev/docs/api-reference/endpoint/monitor-google), [AI Overview schema](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview), and [official Node SDK](https://github.com/cloro-dev/cloro-node).

Cloro's client exposes resource groups such as `client.monitor.google(params)`, backed by authenticated hosted endpoints. Its Google response nests Overview text, optional Markdown, positional sources and citation-related fields in `result.aioverview`. Its broader SDK includes unrelated engines, hosted async tasks and account credentials.

This package keeps the useful concepts—typed client configuration, named resources, optional formats, positional citations and explicit errors—and organizes them for local Google Overview work:

| User need | AI Search Overview Kit |
| --- | --- |
| One answer | `overview.get()` |
| Saved response | `overview.parse()` |
| Multiple queries | `overview.batch()` |
| Publisher destinations | `sources.resolve()` |
| Local dependencies | `setupRuntime()` / terminal `setup` |
| Custom wire parsing | `advanced` entry point |

The root API follows googlemaps-kit's `sdk()` and namespace style. There are no Cloro API calls or credentials, no claim of Cloro retrieval parity, and no methods pretending to implement other engines or platform services. Older monitoring-envelope converters remain under `advanced` for integrations that already use that shape.
