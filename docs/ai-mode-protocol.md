# AI Mode transport evidence — 5 November 2026

AI Mode snapshot parsing works for the two-turn browser reference in `tests/fixtures/ai-mode/`. This does **not** establish a working anonymous HTTP conversation transport. The `aiMode.get()` method is experimental: it requests the distinct `/search?udm=50` surface and preserves blocked/unverified outcomes instead of substituting an ordinary Search answer.

## Controlled anonymous sessions

Each probe used a new curl_cffi session with its own Google-homepage cookies, certificate verification enabled, no account cookies, no proxy, no redirect auto-follow, and a 19-second overall fetch deadline. The same breakfast query and US/English parameters were used.

| Probe | Initial Search response | After existing embedded bootstrap | Observed outcome |
| --- | --- | --- | --- |
| Existing mgbrowser User-Agent | 302 to same-origin `/search`, preserving `q`, `hl`, `gl` but dropping `udm=50` | Not executed for a redirect | AI Mode downgraded to ordinary Search, not an AI Mode answer. |
| Chrome 131 User-Agent, existing transport profile | 200 session bootstrap document | 302 to `/sorry/index`, 1,818 ms total | Access challenge; no answer-turn marker. |
| Matching curl_cffi Chrome 131 TLS profile and User-Agent | 200 session bootstrap document | 302 to `/sorry/index`, 1,275 ms total | Access challenge; no answer-turn marker. |

The matching-TLS probe changes only the private experiment; no shipping runtime defaults were changed. No CAPTCHA was followed or solved. The route validation remains strict: a transition that drops `udm=50` is rejected, while preserving it and adding an allowed bootstrap parameter is accepted by the deterministic runtime test. Public metadata contains no raw redirect tokens or cookies.

## Browser-observed answer routes

The live browser asset inventory observed distinct initial-answer and follow-up requests. Only route names and query-key names are recorded here; account/session values are not reproduced or used in the anonymous transport.

- Initial answer: `/async/folwr`; keys `srtst`, `garc`, `mlro`, `mlros`, `ei`, `q`, `yv`, `vet`, `ved`, `aep`, `cs`, `gl`, `hl`, `sca_esv`, `udm`, `stkp`, `async`.
- Follow-up: `/async/folif`; keys `srtst`, `ei`, `yv`, `aep`, `cs`, `gl`, `hl`, `sca_esv`, `udm`, `stkp`, `csuir`, `elrc`, `mstk`, `q`, `ved`, `async`.

These observations establish that initial and follow-up generation are separate browser request paths. They do not establish which parameters are mandatory, how server-issued state is generated, an anonymous request recipe, stream framing, or a reusable conversation protocol. An endpoint name alone is not an implementation. A working browser-free follow-up needs independently acquired state from its own successful session, actual response captures, and replay tests before being claimed supported.

## Snapshot boundaries

Actual captured `data-scope-id="turn"` elements contain their own main/source columns. The parser preserves turn order and exposes the latest observed answer, with place and image data from that same turn. It does not infer missing conversation history or combine earlier-turn source arrays into the latest result. The real two-turn fixture exercises an initial breakfast question and a vegetarian-options follow-up. All fixture transformations and hashes are recorded beside the fixture.

## Place header and prompt fidelity

For the observed place-card structure, `type`, `priceLevel` and `status` come from the card's own header rows adjacent to its rating, not answer prose. Raw strings are retained: for example `Brunch`, `$20–30`, `Open`. Values are optional when that structure or value is absent. Ratings and review counts retain the visible accessibility label's values; review counts such as `2.0K` are not converted to an invented exact count.

The captures contain Call buttons but no visible `tel:` destination and no explicit `data-place-id`, so `phone` and `placeId` are omitted. Direction-link hex identifiers, CIDs and MIDs are not represented as Google Maps API place IDs. `prompt` comes only from each actual `AI Mode reply for …` heading. It is absent for snapshots without that heading, rather than inferred from the request URL or previous turn.

## Independent implementation review

The [XD06 protocol notes](https://github.com/XD06/google-ai-mode/blob/master/docs/PROTOCOL.md) describe a tokenized `folif` request and a browser fallback. Its [engine](https://github.com/XD06/google-ai-mode/blob/master/src/ai_mode_mcp/engine.py) requires caller cookies and rejects a logged-out bootstrap. Its HTTP fast path therefore does not demonstrate anonymous operation. The repository had no declared license in the GitHub metadata inspected on this date; its source was read privately, not executed or copied into the SDK.

That implementation's modern path expects server-issued `data-xsrf-folif-token` and `data-stkp` before requesting an answer; other values include `elrc`, `ei`, `srtst` and `ved`. This agrees with the need to acquire state before calling the observed async routes. Its claim that `folwr` was retired is not universal: our ordinary browser capture still used `folwr` for its initial answer. Route selection must follow current same-session evidence.

The [native-fetch gist](https://gist.github.com/ayashiiiyo/3400c950a49b790cb29be5cb8942a91d) similarly obtains state from a Search shell, but loads a local cookie file or falls back to a hard-coded NID. Neither source establishes a successful cookie-free flow. The foreign cookie and session values were not used.

The reduced answer DOM also keeps accessible rating labels as text and uses the actual aria-label for icon-only Directions/Website anchors. Known copy/share/feedback clusters are excluded structurally; hidden legal/dialog scaffolding is not treated as answer prose. Adjacent place metadata fields are separated for Markdown readability.
