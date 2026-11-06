# Changelog

## 0.3.1 — 2026-11-06

- Return recognized native transport access challenges as `blocked`, preserving the actual upstream HTTP status and a cooldown hint.
- Keep regional and unsupported redirects explicitly `unverified`; do not follow redirects or report them as missing Overviews.
- Preserve safe runtime timeout, initialization and bootstrap failure reasons without exposing child-process output, cookies or redirect query strings.
- Extend opt-in per-client traffic cooldowns to challenges returned by the embedded runtime, including queued requests.
- Run the Python driver regression suite in CI alongside the Node tests.

## 0.3.0 — 2026-11-06

- Extract simplified Google organic-result cards, snippets and displayed URLs while excluding advertisements and Overview cards.
- Resolve citation and organic URLs together with `search.get(query, { resolveSources: true })`; preserve original redirect URLs.
- Honor Google-declared redirect waits, isolate request-scoped cookies, limit lookup concurrency and spacing, and expose resolution counts and total timing.
- Add canonical location hints and explicit native desktop-profile options. These do not guarantee a physical IP location or Chrome rendering.
- Normalize inline markup in citation labels.

## 0.2.1 — 2026-11-06

- Focus public documentation on installation, SDK usage, supported features and limitations.
- Remove competitor references and development investigation reports from the repository and package.

## 0.2.0 — 2026-11-06

- Preserve rich Markdown, citation groups, inline videos, and Google product links from supported AI Overview layouts.
- Parse saved Google AI Mode conversations, including follow-up turns, place cards, and images. Live AI Mode retrieval remains experimental and is not verified working.
- Add optional per-client concurrency limits, request spacing, access-denial cooldowns, and Retry-After handling without automatic challenge retries.
- Add optional exact-query deduplication within an Overview batch.
- Document supported layouts and runtime limitations.

Validation: 240 deterministic tests, build and type checks; CI on Node 18, 22, and 24. Live Overview retrieval was confirmed before release, with another query returning unverified. Overview availability and extraction completeness are not guaranteed.
