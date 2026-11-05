# Browser-free Google AI Overview investigation

Investigated November 4, 2026. **Follow-up work obtained actual Overviews in fresh HTTP sessions without a browser application.** The accepted path embeds mg-sparkle/Boa and still links browser DOM/CSS/layout code; it is not browser-engine-free. Acceptance is intermittent. See the [reproducible command and verified results](runtime.md) and [saved answer/source JSON](google-search-browserless-results.json). The earlier jsdom failures below remain valid historical observations.

The requirement here is cold startup without launching a browser, importing a browser session, or delegating retrieval to a provider whose implementation is unknown. HTTP requests made after a browser establishes a session do not meet that requirement.

## What the actual response establishes

An earlier successful, signed-out native Chrome capture contains literal Overview HTML in the initial normal Search document. The initial response is 1,075,503 bytes, SHA-256 `6f1961e73d4aae183441dc5bb0735ce04733c0c4fbd47b35b55743ae49b50a1b`. Its parsed Overview has 620 characters and four distinct Google source redirects. It ends at `Human Eyes:`; it does not establish a complete expanded answer. The sanitized capture omits cookie headers, so signed-out does not mean cookie-free.

This proves that a separate generation endpoint is unnecessary for that observed delivery path. It does not establish that an arbitrary HTTP client can obtain the same document. The separately captured `/async/callback:6761` response was associated with a People Also Ask expansion, not initial Overview generation. AI Mode's `udm=50` and `/async/folif` are also not interchangeable with a normal Search Overview.

## Primary-source GitHub audit

These classifications come from actual source at the linked revisions. Public success claims are distinguished from our own execution. No downloaded scraper or custom browser was executed.

| Project | What its source does | Meets cold browser-free Overview requirement? |
| --- | --- | --- |
| [Cloro's Overview example](https://github.com/cloro-dev/google-ai-overview-scraper) | Calls Cloro's authenticated hosted API. Its [implementation article](https://cloro.dev/blog/how-to-scrape-google-ai-overview/) describes browser rendering. | No disclosed browser-free implementation. |
| [gsearch, `439b6cc`](https://github.com/RayenMlayeh/gsearch/blob/439b6ccc303a574e821e75b4c796383312678d3f/packages/gsearch-core/src/gsearch_core/hybrid.py) | Starts Camoufox, exports its anonymous session and navigation headers, then uses HTTP. Gates can reopen the browser. | No; browser bootstrap. |
| [omkarcloud/google-scraper, `091d97f`](https://github.com/omkarcloud/google-scraper/blob/091d97f8ecf8d953bce0eac8a83018c72fe4f1c4/google_search/identity.py) | Establishes an identity through headed Camoufox and reuses it with `curl_cffi`. Its plain HTTP support for other Google products is not proof of browser-free Search. | No; browser bootstrap. |
| [google-ai-reversed, `e514719`](https://github.com/snipe1337/google-ai-reversed/blob/e5147199871ee2e44c4ca75430df0a8d7db0acc6/googleAiReversed.py) | Uses `udm=50` and `/async/folif`, with a Playwright fallback. | No; AI Mode and browser fallback. |
| [wafer, `c21ad2f`](https://github.com/Averyy/wafer/blob/c21ad2f0a76c8d45b285e7b878211e9899263420/wafer/_searchguard.py) | Executes SearchGuard with bounded QuickJS-NG and a DOM shim. Its own [research report](https://github.com/Averyy/wafer/blob/c21ad2f0a76c8d45b285e7b878211e9899263420/docs/ref-searchguard.md) reports no successful SERP through that solver. | Browser-free computation exists; accepted Search/Overview retrieval is not demonstrated. |
| [SearchGuard VM reversing tools, `c617f44`](https://github.com/Sec-CH-Lemon/google-search-guard-vm-reversing/tree/c617f4406ce1c373d5e071ae0f969de101ec4505) | Offline interpreter/probe tooling using jsdom, with instrumented-versus-original output checks. | Analysis tooling, not an accepted retrieval client. |
| [mgbrowser, `fdf935c`](https://github.com/pierce403/mgbrowser/tree/fdf935c1a9a1446395cc61717b4a0d2047cd85b3) | A custom Rust browser engine. Its [work log](https://github.com/pierce403/mgbrowser/blob/fdf935c1a9a1446395cc61717b4a0d2047cd85b3/memory/logs/2026-11-03.md#L41) reports four cold SearchGuard runs returning HTTP 200 SERPs after engine fixes. | A browser-engine library. Our later standalone adapter returned actual Overviews without launching its application; see the follow-up guide. |

The inspected Puppeteer, Selenium, Playwright and installed-Chrome Overview projects likewise require browsers. This is a bounded source audit, not proof that no browser-free method exists anywhere.

## Earlier jsdom execution

The earlier jsdom prototype uses Python 3.11, `curl_cffi@0.17.0`, Node.js 26.10.0 and `jsdom@29.1.1`. Dependencies are isolated from the package. It launches no browser executable and uses no browser cookies, account session or proxy. TLS verification stays enabled.

The HTTP client requests normal Search for `why is the sky blue`, with English/US parameters. It retains only its own anonymous Set-Cookie values. The computation context executes the returned bootstrap wrapper and runner, with the original source URL and script positions, inside jsdom. It has no exposed Node `process` or `require`; subresource loading is not enabled and script-initiated request interfaces are blocked. Computed navigation is accepted by the probe only for the same HTTPS Google Search origin and original query.

| Stage | Observed outcome |
| --- | --- |
| Initial HTTP/2 Search request | HTTP 200, 94,266 bytes; JavaScript bootstrap, no Overview. |
| Local bootstrap execution | 29 ms; produced an `SG_SS` value of 1,324 characters and a same-query navigation. No surfaced script errors or attempted subrequests. |
| HTTP/2 follow-up with computed state | HTTP 302 to `/sorry/index`, 477 bytes; no Overview. Redirect not followed. |
| Total experiment | 3,962 ms to failure. This is not successful-result latency. |
| HTTP/3-only comparison | Failed certificate verification before a Search response was obtained. Verification was not disabled. No HTTP/3 acceptance conclusion follows. |

The HTTP library's numeric version `3` denotes its `V2_0` enum, **HTTP/2**, not HTTP/3. The successful native capture used HTTP/3, but the current evidence does not isolate protocol as the cause of success.

An earlier minimal Node VM prototype also computed state and received a `/sorry/index` redirect, in approximately 1.2 seconds. Subsequent offline work added standard performance timing, iframe realms and event behavior. Producing a longer token, completing without a surfaced exception, or seeing HTTP 200 for the initial bootstrap does not establish acceptance. Internal caught errors and host-environment observations can be encoded in the computed response.

The inspected custom-browser source suggests additional DOM compatibility questions: Window/Navigator prototype relationships, receiver checks, iframe globals, Image/media behavior and event interfaces. Its Boa-specific direct-eval fix does not directly apply to Node/V8. Implementing or matching these APIs would still need fresh server acceptance testing; the source does not establish that any one API is the missing condition here.

## Follow-up implementation and remaining limits

An optional pinned native helper and HTTP command now exist in the source checkout. Two original accepted HTTP captures contain 1,038/1,655 answer characters and 7/8 citation cards, retrieved in 1,161/1,996 ms. A later same-session homepage initialization also returned an Overview in 1,197 ms. These successes establish actual retrieval without launching a browser application. They do not remove the embedded browser-engine dependency or establish universal Google acceptance.

The protocol audit corrected duplicate cookie inputs, mismatched user agents and script-navigation headers in the jsdom experiment. Those changes did not make jsdom accepted. Passive tracing found deliberate JavaScript error probes rather than unexpected fatal runtime errors. The accepted embedded host implements additional standard interface descriptors; no isolated cause of the difference has been proved.

The standalone command establishes its own anonymous homepage session, requests Search, computes only the recognized bootstrap, then allows one same-origin/same-query transition. It does not follow traffic challenges. Later sessions using both the original successful experiment and the new driver were rejected. That variation cannot be attributed solely to a wrapper regression, IP reputation, transport, timing or one missing API from the available evidence.

The parser safely reconstructs the observed literal Overview HTML transfer without executing response scripts. Expanded text recovery is separate from proving complete generation. Source redirect destinations are not automatically resolved by the SDK; the saved result artifact separately resolves all 15 observed links through direct Google GET redirects without visiting publisher pages.

Remaining work includes acceptance reliability, a smaller accepted runtime, wider query/locale coverage and an explicit generation-completion signal. The default SDK HTTP path remains unchanged; the native adapter is opt-in. There is no claim of a fully browser-engine-free or production-reliable implementation.
