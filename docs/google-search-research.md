# Google Search research ledger

The [browser-free source audit and execution report](google-search-browserless-research.md) records the November 4 GitHub investigation and HTTP/jsdom prototype. The initial jsdom prototype remained rejected. Follow-up work obtained actual Overviews through HTTP plus an embedded engine library without launching a browser application; acceptance is intermittent and browser-engine code remains a dependency. See the [working experiment and limitations](runtime.md).

## November 4, 2026: verified rendered AI Overviews

Two actual Google AI Overviews were obtained through ordinary navigation in an existing signed-in in-app browser: `why is the sky blue` and `why do leaves change color in autumn`. Each had the visible AI Overview heading on normal Search, substantive answer text, and supporting links. No credentials or cookies were extracted or replayed. A fresh anonymous Chromium 156 request for the sky query still reached the unusual-traffic challenge; REA inventory evidence is `ev_116dede271c02a66acdd739cf0e03bc41a176378fa657827f0355792dea6f225`. These observations establish a working eligible-browser path, not a universal sign-in requirement or anonymous HTTP equivalence.

Google's current [AI Overview help](https://support.google.com/websearch/answer/14901683?hl=en&co=GENIE.Platform%3DDesktop) describes availability to all users in listed countries/languages and selective triggering. [AI Mode](https://support.google.com/websearch/answer/16011537?hl=en&co=GENIE.Platform%3DDesktop) is a separate experience; Labs sign-in requirements must not be generalized to every Overview.

### Observed markup and extraction

- The actual layout is not the synthetic semantic region used in the earlier parser. It has `#m-x-content`, an outer level-two AI Overview heading, answer prose in `data-container-id=main-col`, and citation cards in `rhs-col`.
- Citation-card anchors can have no text content. Their source title is in `aria-label`; their destination is in `href`. Inline citation widgets use `data-suuid`. Prose extraction removes the widgets and media/control blocks while preserving normal headings and prose links.
- Hidden error/loading templates can coexist with a valid answer. Raw text matching would misclassify them. The hidden accessibility text `AI Mode replied:` also occurs inside a real Overview; product identity follows the outer heading and normal Search URL, not that string alone.
- The initial oversized DOM strings were truncated at 200,011 characters. They were replaced by complete scoped captures after removing scripts/styles/SVG/media/comments and unnecessary attributes before serialization. Only the complete captures support fixtures. No account header or location footer is retained.
- Three fixtures and SHA/sanitization provenance are in `tests/fixtures/google-search/aio-provenance.json`. Collapsed and expanded prose differ, so extraction does not assume the first snapshot is the complete answer.

### Show more, source code and evidence

The actually loaded Search core asset has SHA-256 `67b206f0d0e77dd151169ffe3c248671856660b73cd19ec373bc2435ad1d83e6`. Its `AkrxPe` controller at bytes `[965174,969460)` binds the observed Show more action to `mMVKRd`. It calls the `TPfxRd` model's expansion method. That model, bytes `[812336,813482)`, transitions from `COLLAPSED_ON_SRP` to `EXPANDED_ON_SRP`, or to an overlay under an experiment flag. Subscribers reveal existing text with DOM/style changes; the control acknowledges `aria-expanded=true`.

Focused REA evidence parsed those exact source excerpts without executing them:

| Module | Evidence |
| --- | --- |
| AkrxPe expander controller | `ev_682ade09b8e0dc1e7c545fc93d876a2e170e68b93c8cfd9c8dc9e47326cba819` |
| TPfxRd state model | `ev_0cef044760debe2533cfe42a24812d32ae2207311c23afabe4fa8ba2e752130f` |

Neither inspected module makes a content-fetch request. Optional `/client_204` traffic is telemetry. This supports local disclosure in the observed path; it does not prove every experiment behaves identically. `pJyqm`/`FRbqE`, also present around the Overview, manage translation state and are not generation endpoints.

The loaded source also contains generic `/async/{type}` builders and a custom ADL renderer using hexadecimal-length `;`-delimited type/data frames. It is not SSE. A separate builder defaults to `udm=50` and chooses `folif`/`folwr` for AI Mode/follow-up operations. These are static capabilities, not a captured initial Overview generation request. They do not justify an HTTP generation client or replaying user tokens. Whole-bundle graph analysis exceeded practical/tool limits; only the bounded module evidence above is claimed.

### Implemented and verified

`googleSearch({ page }).aiOverview(query)` now navigates a caller-owned browser, optionally expands once, and returns the parsed snapshot and citations. It waits for unchanged text/sources for a configurable quiet period; that is an observation criterion, not a server completion signal. Challenges, login/consent redirects, missing structures, cancellation and deadlines remain explicit.

The compiled SDK method was executed through a CUA-backed adapter that routed browser actions through the actual in-app browser and supplied only the scoped Overview DOM. With `hl=en, gl=us`, it returned:

| Query | Answer characters | Deduplicated sources | Observed client time |
| --- | ---: | ---: | ---: |
| why is the sky blue | 1,016 | 6 | 3.6 s |
| why do leaves change color in autumn | 1,656 | 8 | 4.2 s |

Both results were present, expansion-acknowledged, settled and within the deadline. They vary from the earlier capture because query context and generated content vary. Browser transport does not install a browser, extract session credentials or submit a follow-up to AI Mode. The caller supplies an eligible Page.

Still unresolved: a successful initial-generation HTTP request/replay, anonymous equivalence, a wire-level completion signal, complete citation-to-sentence alignment, and coverage across experiments/locales. Organic/PAA parsing has not been promoted by these scoped Overview captures.

### Direct HTTP investigation: initial delivery and deferred loading

A further pass traced the actual initial Overview controller, not just its expander or the AI Mode composer. In the same captured core asset (SHA-256 above), `EYwa3d` occupies bytes `[1009095,1019057)`. It reads `data-aquarium` and `data-mff`. When Aquarium is enabled and mff is not, it calls animation/loading-state helpers directly and skips the deferred loader.

A fresh successful sky-query browser page selected that exact branch: `data-aquarium` and `data-umr` were present, `data-mff` and `data-fsid` absent, and no child deferred async target remained. The observed resource inventory exposed no Overview async request; its coverage cannot exclude activity before observation. Thirteen retained `window.jsl.dh` HTML-transfer calls contained no Overview heading, answer column or matching answer text. Taken together, these observations support initial Search-document delivery for this run. They do not prove whether the successful response contained literal or encoded answer HTML, because the original response bytes were unavailable.

The alternate branch is also mapped statically:

1. `EYwa3d` selects `folif` for mff and `folsrch` otherwise, locating the target through `data-fsid` or a `P6l5q` child.
2. `_.hzu`, bytes `[943977,945325)`, can reuse an existing `google.ia.r[targetId]` request. Its rendering path uses MADL/ADL for mff/umr, otherwise the progressive format.
3. Generic async identity, bytes `[869136,869523)`, selects a callback for `data-async-fc`, `folif` for `data-async-elrc`, or the target's `data-async-type`.
4. The request builder, bytes `[873883,876678)`, constructs the route and page context. Query additions can include `q`, `mlro`, `mlros`, `madse`, `gsessionid`, `mstk`, `mrc` and `snr`. Their presence depends on the page; values were not extracted from the user's session. A minimal static URL is not equivalent to a captured deferred request.

These findings are direct readings of byte-exact shipped-code excerpts correlated with separate browser observations. A focused REA graph request did not finish within the practical window; no new REA result or Evidence ID is claimed. The [provider's own documentation](https://serpapi.com/ai-overview#example-with-an-extra-request-required) independently describes both embedded Overviews and those needing a second request; this is corroboration, not proof of this SDK's live replay.

An ordinary Node GET of the sky query returned HTTP 200, 93,093 bytes and `javascript-required` in 283 ms. One minimal `/async/folsrch` GET with query, locale, `yv=3` and `_fmt:prog` returned HTTP 502, not an answer. No deferred target was captured for that request, so it is a failed minimal probe rather than a faithful replay. No retry, invented context, browser credential extraction or challenge solving was used. Browser source-view inspection was rejected by its URL-scheme policy; no alternate route around that browser restriction was attempted.

The parser no longer requires `m-x-content`: the captured expander code assigns that ID at runtime. It also recognizes the exact observed `pJyqm`/`FRbqE` wrapper, outer Overview heading and answer column without it. The existing HTTP `search()` method can therefore parse that structure without a Page or script execution. Tests remove only the runtime-added ID from sanitized rendered fixtures and use an injected HTTP response; they are explicitly derived cases, not successful raw-response captures. All 80 Search unit tests and the full type check passed.

The remaining verification requires a successful original Search response, or a sanitized successful deferred request and response with its bootstrap page. Browser automation is not established as a fundamental protocol requirement; live browser-free retrieval is still unverified here.

Final validation after the parser change: source build, all 977 offline tests and a focused Search source/test type check passed. The full repository type check encountered WebAssembly declaration errors in a concurrently added, unrelated Maps inspection script, `scripts/inspect-maps-wasm-bindings.ts`; that script was left untouched.

### Native Network capture resolves the missing response evidence

The original response was subsequently captured directly through native Chrome for Testing's Network panel and its sanitized HAR export, without asking the user to supply a recording. The Google page visibly showed **Sign in** and a real Overview for the sky query. No login or password was needed. The main response was HTTP 200, `text/html`, 1,075,503 UTF-8 bytes, SHA-256 `6f1961e73d4aae183441dc5bb0735ce04733c0c4fbd47b35b55743ae49b50a1b`. HAR metadata identifies HTTP/3 and a script initiator. The sanitized export omits cookie/authentication headers; signed out does not establish cookie-free browsing or an unbootstrapped initial GET.

The actual top Overview is literal HTML in those response bytes. It is not merely an encoded template or a selector appearing in a script. Its unique common wrapper for the heading and main/rhs columns is `uUCgYd#gXWog`, inside the observed `EYwa3d`/`data-aquarium` root. It has neither the older `pJyqm` wrapper nor a literal `m-x-content` element. The parser now recognizes that exact document root with the outer heading and answer column, retaining ad/loading/product boundaries.

The compiled parser returned `present`, 620 answer characters and four distinct source links from the untouched original response. These links are Google's opaque `/goto` redirects, not resolved publisher destinations. The answer ends at `Human Eyes:`; response completeness does not prove answer or expansion completeness. A sanitized 8,738-byte HTTP subtree fixture and response/fixture digests are recorded in `aio-provenance.json`. Opaque redirect values are remapped consistently to nonfunctional redacted values, preserving deduplication without shipping page tokens.

The capture also contains `/async/callback:6761`, with 29 complete progressive frames and an Overview-shaped HTML resource. Static matching of its `fc` value against inert bootstrap literals and their nested `jsl.dh` mounts establishes that it belongs to the **People also ask** question “What is the real color of the sky?” Its different answer must not be substituted for the initial Overview. The progressive format has an anti-XSSI prefix, then hexadecimal-length frames measured in JavaScript UTF-16 code units; a JSON header precedes resource-metadata/body pairs. The `[2,null,"0"]` resource carries HTML. The third metadata slot's semantics remain unknown.

Direct replay did not reproduce the successful document. Node fetch using the captured public URL and Accept/Accept-Language/User-Agent returned a 94,072-byte interstitial. All sanitized public request headers still returned an interstitial. A session retaining only cookies issued by its own preceding HTTP response did likewise. A standard Node HTTP/2 request also returned the bootstrap. These observations do not isolate transport, session context and JavaScript execution as independent causes. Replaying the captured PAA callback returned only a header; it does not establish an initial-generation endpoint.

The interstitial's runner invokes `knitsail.a` with a page-specific encoded program, then navigates using computed `sg_ss`/`sei` state or an `SG_SS` cookie. Merely preserving HTTP Set-Cookie values does not perform that computation. The embedded 63,218-byte interpreter was decoded inertly and inspected, SHA-256 `76ae85d62858a0f5d4a5c329b9477ffaa001b03b75c20b9db4d7491d5edfa203`; its helpers include DOM readiness/events/construction and performance access. Static helper presence is not evidence of which APIs the current opaque program uses, and no accepted browser-free bootstrap result has been established.

A bounded scratch prototype subsequently executed the observed interpreter and a fresh anonymous runner in a mocked Node JavaScript context, with no process/require/filesystem/network bindings in that context. It produced a computed navigation and an `SG_SS` cookie value without a browser. A real HTTP request using that output and only the HTTP client's own anonymous session received **HTTP 302 to `/sorry/index`**, not an Overview, after 1.2 seconds for the complete experiment. No CAPTCHA was followed or solved. The mocked host lacked `performance.timeOrigin` and iframe `contentWindow`; this output may contain an unsupported-host/error result. Its existence is not proof of server acceptance or a complete reconstruction. The prototype is confined to untracked investigation scratch space and is not part of the SDK.

After the real-response parser changes, source build, full type check and all **1,135 offline tests across 96 files** passed, including 91 Search tests. These counts include concurrent Maps changes and do not establish live HTTP bootstrap success. The temporary native capture window was closed after saving the recording and visual proof. The earlier missing-HAR requirement is resolved; the remaining gap is fresh browser-free retrieval and complete-answer verification.

## Earlier anonymous investigation: October 29, 2026

Observed October 29, 2026. Scope: anonymous public Search HTML, autocomplete, organic links/snippets, related questions/searches, and actual Google AI Overviews. No signed-in account, proxy, CAPTCHA solution or alternate-IP mechanism was used.

## Findings

| Question | Observation | Status |
| --- | --- | --- |
| Can anonymous autocomplete return structured suggestions? | `suggestqueries.google.com/complete/search?client=firefox&q=typescript&hl=en` returned HTTP 200 and a JSON tuple containing the original query, ten suggestion strings, and subtype metadata. | Observed; implemented and live tested. |
| Does plain Node fetch return Search results? | `www.google.com/search?q=what+is+typescript&hl=en&gl=us` returned HTTP 200, a JavaScript retry/enable-JavaScript interstitial, no `h3` result titles and no recognized result container. | Observed; explicitly classified. |
| Does normal browser execution resolve that page? | Unmodified headless Chromium 156 executed the page and followed a 302 redirect to `/sorry/index`. The final HTTP 200 page reported unusual traffic and displayed reCAPTCHA, with no result titles. | Observed; explicitly classified. |
| Can organic titles, URLs and snippets be extracted from current Search markup? | No successful result page was obtained in this environment. A bounded parser handles linked `h3` titles under `#search`/`#rso`, common snippet containers, and basic link decoding. | Experimental structural implementation; current live markup unverified. |
| Can actual AI Overview text and sources be retrieved? | No overview was returned before the access challenge. The parser supports explicitly labeled semantic regions without generating any content. No private overview request format was established. | Unresolved; no claim of live retrieval or absence. |
| Can related questions be expanded or fetched separately? | The blocked result page exposed no usable question expansion flow. Only explicitly labeled supplied HTML is parsed. | Expansion protocol unresolved. |

## Runtime evidence

REA target discovery `ev_c930379ae4d43fe4ea4aeee9f3a4d6204fe81b600ac9ed7bde7b9c57a2afbf5a` observed a Chrome 156 page at Google's `/sorry/index` after the normal Search navigation.

REA bundle evidence `ev_e6d7545da32207ae31b9a9fae90991ad7f8d92dbe362c804c220390b2f2a0eba` observed and analyzed seven scripts from that denied page, with no parse failures. This establishes the captured denial page, not the missing Search/AI subsystem. The selected scope was `https://www.google.com` at loopback CDP endpoint `http://127.0.0.1:9341` with a 500 ms observation window.

REA's static bundle analysis does not execute JavaScript; browser navigation was performed separately. Its findings do not establish earlier network activity, server-side behavior, string-built endpoints, encrypted configuration, uncaptured origins, or code from an unavailable successful result page. No endpoint inference from the CAPTCHA scripts is used as a Search or AI Overview API.

## Fixtures and evidence quality

`tests/fixtures/google-search/provenance.json` records capture dates, original SHA-256 digests, transports and sanitization for the actual responses. The saved autocomplete tuple is unchanged. HTML fixtures remove scripts, frames, challenge/form values, event handlers, origin-trial data and tracking values; the network IP is redacted. The meaningful interstitial and unusual-traffic structures are preserved.

`structural-search.html` is synthetic. It tests safe handling of the parser's declared HTML contract, including snippets, a semantic overview region, related content and advertisement exclusions. It is deliberately separated from live evidence and does not establish Google's current positive markup. Unknown or incomplete HTML remains `unrecognized`, and an unrecognized overview remains `unverified`.

## Official access and pricing

Google's current [Custom Search JSON API overview](https://developers.google.com/custom-search/v1/overview) states that the API is closed to new customers and existing customers must transition by January 1, 2027. For existing customers until discontinuation it lists 100 free queries per day, then $5 per 1,000 requests up to 10,000 queries per day. It requires an API key and configured Programmable Search Engine. This implementation does not use that API.

Google's [AI features documentation](https://developers.google.com/search/docs/appearance/ai-features) explains that AI Overviews appear selectively and often do not trigger. An empty parser result therefore cannot establish whether an overview was generated for a query. Google's [Search help page](https://support.google.com/websearch/answer/14901683?co=GENIE.Platform%3DDesktop&hl=en) describes the Web filter as excluding AI Overviews, but this investigation did not verify that filter's request parameters or use it as an overview-retrieval mechanism.

At the end of the October investigation, no working retrieval method had been established. The November investigation above subsequently verified browser-backed retrieval and expansion. Initial-generation HTTP replay remains unresolved, and the implementation does not claim full Search or AI Overview protocol parity.
