# Changelog

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
