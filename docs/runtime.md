# Local runtime

```sh
npx aisearchoverview-kit setup --python python3.11
```

Prerequisites: Node 18+, Git, Rust 1.91+ and Python 3.10+. Setup creates a Python environment with `curl_cffi==0.17.0` and builds the pinned mg-sparkle/Boa helper. It writes to `~/.cache/aisearchoverview-kit`, not a browser profile or the installed npm package. No npm lifecycle script performs these steps automatically.

The SDK's default `embedded` transport sends HTTP requests and runs the local helper for a recognized Google session bootstrap. It launches no Chrome, Playwright or browser application. The helper is still built from browser-engine DOM/CSS/layout/rendering code; it is not browser-engine-free. Google can reject a validly computed session. No CAPTCHA handling, proxy, account cookies or paid provider is configured.

`setupRuntime({cacheDirectory?, pythonCommand?, signal?})` is also available from the SDK. Setup builds may take several minutes the first time. Git source identity, revision and tracked-file cleanliness are verified, and Cargo uses a lockfile. Repeated setup can reuse the source/build cache.

| Setting | Purpose |
| --- | --- |
| `AI_SEARCH_OVERVIEW_CACHE` or `cacheDirectory` | Runtime cache directory. |
| `AI_SEARCH_OVERVIEW_BOOTSTRAP` or `bootstrapExecutable` | Trusted prebuilt helper path. |
| `AI_SEARCH_OVERVIEW_PYTHON` or `pythonExecutable` | Python interpreter with the pinned HTTP client. |

`npx aisearchoverview-kit get "query" --cache DIRECTORY` selects a custom cache. `--bootstrap` and `--python` can select trusted executables for a particular CLI call. `--http` requests plain HTTP without a helper; it may return a JavaScript-required result. Offline `parse` needs no runtime setup.

Every embedded request uses a fresh anonymous HTTP session and starts at the exact requested Search URL, without a preliminary homepage visit. It permits at most one computed same-origin/same-query transition: one initial Search HTTP request plus at most one bootstrap follow-up. Only cookies issued to that session by its Search responses are used; its JavaScript-readable cookies may enter the helper, while HttpOnly cookies remain in the HTTP client. Values and computed navigation are not printed in SDK results. TLS verification remains enabled, and traffic redirects are not followed automatically.

The built-in embedded transport accepts `ipFamily: 'auto' | 'ipv4' | 'ipv6'` in `sdk()` configuration, defaulting to `auto`. For example, `sdk({ipFamily: 'ipv4'})` restricts that client's native HTTP connections to IPv4. Explicit IPv4/IPv6 selections stay fixed; `auto` leaves connection-family selection to libcurl. The SDK does not retry a Google denial using another family. The setting does not change headers, IP geolocation, Overview eligibility or Google's access decisions. It does not apply to `sources.resolve()`, plain HTTP transport or a caller-owned `fetch`; configuring it with either of the latter is rejected. Custom transports must configure their own connections.

The helper's [process/build contract](../tools/google-search-bootstrap/README.md) documents its limits and licenses.

## Hosted access and recovery

The npm package cannot guarantee that Google accepts a hosting provider's network or shows an Overview for a query. A paid container permits the runtime to execute; it does not grant Google access. Match the host region to your intended search market. Search's `country` and `location` hints do not change the server's IP location.

The native path parses the initial accepted Search HTML and supported literal transfers. A different browser presentation can request an Overview later; this runtime does not implement that deferred generation flow. An unverified initial response does not establish that the rendered browser would have no Overview. No per-query availability or response-time guarantee is provided.

Recognized challenge redirects, HTTP denials and CAPTCHA pages return `status: 'blocked'`. `metadata.httpStatus` preserves the observed status, including a challenge delivered as HTTP 302. `metadata.retryAfterMs` provides a pause hint when available. Regional redirects return `unverified` with an explanatory reason. No redirect is followed automatically, and neither case is reported as a confirmed absent Overview.

Reuse one client per service to apply its opt-in traffic controls across requests:

```ts
const client = sdk({
  traffic: { maxConcurrent: 1, maxQueued: 64, minIntervalMs: 10_000, cooldownMs: 60_000 },
});
const result = await client.overview.get(query);
if (result.status === 'blocked') {
  // Defer work; the same client rejects queued calls without contacting Google.
  console.log(result.metadata.retryAfterMs, result.reason);
}
```

These settings are example service limits, not a verified Google allowance. Creating another client, restarting a container, or automatically retrying a challenge is not recovery. Surface the unavailable state, honor the pause, and use an earlier successful report only when its age and query settings are shown. Persist cooldown state outside the process if your service spans instances or restarts.

When traffic controls are enabled, `maxQueued` limits waiting requests per client to 64 by default (configurable from 0 to 10000). Excess requests fail locally with HTTP-kind status 503 without contacting Google; this does not open an upstream denial cooldown. A cancelled waiting request releases its queue slot. A zero limit permits immediate execution only, including when start spacing would otherwise delay a call. This bounds local memory under bursts; it does not coordinate multiple service instances or establish a Google traffic allowance.

Runtime execution timeouts throw `AiSearchError` with `kind: 'timeout'`; unsupported bootstrap execution throws with `kind: 'parse'`. Initialization/network failures retain `kind: 'network'`. Runtime limits remain bounded: the helper has at most ten seconds within the nineteen-second retrieval budget. Increasing only the SDK timeout does not extend these limits. A slower host may need more CPU; do not treat a timeout as proof Google denied access.
