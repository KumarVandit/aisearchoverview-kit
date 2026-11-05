# Layout coverage audit — 5 November 2026

The SDK was tested against 24 fresh US/English queries across science, household tasks, health, finance, legal procedures, gardening, shopping, recipes, travel, local businesses, programming and numerical comparisons. **15 returned recognized Overviews; 9 returned readable Search results without an observed Overview marker.** None failed at the transport level. This is a single-session sample, not an availability guarantee.

All 15 HTTP positives used the same simplified Search layout. Topic breadth therefore does not establish support for every Google UI. Two additional expanded, ordinary-browser references exercised actual rich comparison and programming layouts. The browser was a test reference only; no browser fallback was added to SDK retrieval.

## What passed

- Live result versus offline parsing of the same response: status, text, Markdown and sources matched for all 24 captures.
- An independent JSDOM structural reference counted 28 lists and 134 list items across the 15 HTTP positives. All answer words in that model appeared in extracted text: 100% **unique-token recall**. This does not measure word order, duplication, visual fidelity or generation completeness. No actual tables, code blocks or answer images occurred in these HTTP positives.
- The expanded Python reference contained five real code blocks and one comparison table. Regression tests assert every code block verbatim, including indentation, blank lines and trailing spaces, plus table headers and inline code cells. Eight sources and seven citation-pill entries survive the public SDK.
- The expanded induction/gas reference preserves headings, lists, 14 sources and nine citation-pill entries. Visible video cards are **not** returned as structured videos.
- Build, type checking and all 195 offline tests pass. Eighteen formatting cases are explicitly synthetic; two new tests use sanitized real rendered projections. Existing sky/leaves fixtures remain separate evidence.

The live harness observed 1.06–2.50 seconds per case, median 1.56 seconds, measured from immediately before retrieval through an additional offline parse. These are local samples, include unverified responses, exclude first-time runtime installation and do not establish latency for rich browser layouts.

## Delivery differs by context

`python list comprehension examples` had no observed Overview marker in the anonymous HTTP response. The same query did show an expanded Overview in the existing signed-in browser session. The code/table parser works on that supplied capture, but the current HTTP session did not receive it. This is a delivery/context coverage gap. It must not be described as either guaranteed Google absence or successful browser-free retrieval of the rich response.

All nine unverified HTTP responses had ordinary organic results and no recognized AIO marker; they were not blank error pages. The public `unverified` state remains appropriate. A single observation cannot determine whether the cause is eligibility, session, rollout, location, timing or personalization.

## Cloro schema comparison

Cloro documents `text`, `markdown`, `sources`, `citationPills`, `relatedLinks`, `videos`, `places`, `map` and `ads` inside its Overview result. These are possible shapes, not a promise that every query contains them. [AI Overview documentation](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview).

| Feature | Current SDK evidence and limits |
| --- | --- |
| Text and Markdown | Supported for recognized simplified/rich layouts; completeness remains unverified. |
| Headings, emphasis, lists and links | Real HTTP and rendered references. Ordered starts/reversal also have synthetic tests. |
| Code and basic tables | Real rendered Python reference; no positive HTTP example in this run. No merged-cell grid reconstruction. |
| Images | Safe HTTP(S) Markdown serialization has synthetic tests; no real answer-image fixture from this run. Projection thumbnails do not prove answer-image support. |
| Sources | Exposed with position/title/url; optional descriptions are not extracted. |
| Citation pills | Now preserved by the public adapter, with source positions. No descriptions; limited to recognized citation markup. Simplified responses may omit pills. |
| Related links | No separate field. Rich body links may currently be added to sources; source/related-link classification is incomplete. |
| Videos | Actual cards observed in rendered comparison; no structured card extraction. A YouTube citation is not a video-card object. |
| Places and map | Not implemented; no positive local AIO capture in this run. |
| AIO ads | Not implemented; ad content is excluded from answer extraction. No positive AIO-ad capture in this run. |
| MathML, arbitrary CSS, interactive widgets | No general renderer or fidelity guarantee. Common mathematical entities have synthetic tests. |

Cloro's [related links](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/related-links) are distinct from sources and have no source-array position. Its [video schema](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/videos) includes card metadata, and [places/map](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/places-and-map) and [ads](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/ads) have their own shapes. The [full Google Search response](https://cloro.dev/docs/api-reference/endpoint/monitor-google) puts recipes, shopping/product results, local results and other SERP modules beside the Overview. Their presence elsewhere on a page must not be counted as AIO support. Cloro does not document separate AIO table or image arrays on the Overview page.

## Changes from this audit

The Markdown walker now preserves code whitespace and safe backtick fences, produces basic tables, retains ordered-list numbering and safe image markup, and decodes common math entities. The public SDK now forwards parsed `citationPills` instead of discarding them. The fixture provenance records distinguish real DOM projections from byte-exact HTTP captures and synthetic layouts.

These changes and this report are unreleased; npm 0.1.0 does not contain them.

## Reproduce

Offline regressions require no Google or Cloro requests:

```sh
npm ci
npm run build
npm run type-check
npm test
```

After the documented runtime setup, explicitly opt into new live requests:

```sh
npx tsx scripts/audit-layouts.ts --live --output .probe/my-layout-audit
npx tsx scripts/audit-layouts.ts --live --targeted --output .probe/my-targeted-audit
npx tsx scripts/audit-layouts.ts --replay .probe/my-layout-audit --output .probe/my-replay
```

The harness saves private raw HTML and parsed results under the chosen directory; use an ignored `.probe` path. Replay executes no captured scripts and makes no network requests. Its independent model removes inert `noscript` fallbacks and known control/source groups after decoding recognized literal transfers. It is a structural/token check, not a browser screenshot comparison. The new browser fixtures are reduced projections of actual expanded main/source columns, with a reconstructed wrapper/heading; CSS, scripts, media payloads, account headers and request identifiers are excluded. See [fixture provenance](../tests/fixtures/google-search/aio-provenance.json).

The sanitized [case results](layout-coverage-results.json) list every query, outcome, timing and structural count. Raw responses and the temporary browser recorder are excluded from Git and npm. No Cloro paid requests were made.
