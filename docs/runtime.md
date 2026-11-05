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

Every embedded request uses a fresh anonymous HTTP session, establishes Google homepage cookies, requests Search and permits at most one computed same-origin/same-query transition. Only that session's JavaScript-readable cookies enter the helper. HttpOnly cookies remain in the HTTP client. Values and computed navigation are not printed in SDK results. TLS verification remains enabled, and traffic redirects are not followed automatically.

