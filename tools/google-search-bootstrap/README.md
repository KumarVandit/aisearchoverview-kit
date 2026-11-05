# Google Search bootstrap helper

This optional native helper executes a recognized Google Search JavaScript bootstrap and returns its anonymous cookie writes and navigation URL. The SDK owns the HTTP session. The helper performs no HTTP requests and launches no browser application, Chrome, Playwright or desktop.

It embeds the `mg-sparkle` DOM/runtime library with patched Boa. That library includes HTML, CSS, layout, image, font and rendering code. The helper invokes its JavaScript/DOM entry point without desktop integration or full-page painting; it is not a stripped pure-JavaScript interpreter. In-document canvas operations remain part of the library.

## Build

Install Git and Rust 1.91 or newer, then run from the package directory:

```sh
node tools/google-search-bootstrap/build.mjs
```

The build script fetches the public [mgbrowser source](https://github.com/pierce403/mgbrowser/tree/fdf935c1a9a1446395cc61717b4a0d2047cd85b3) at revision `fdf935c1a9a1446395cc61717b4a0d2047cd85b3` into the local ignored `engine/` cache. It verifies the repository, exact revision and unchanged tracked source, then runs Cargo with the supplied lockfile. A valid cache can be reused without another Git fetch. The build requires network access for missing source or Cargo dependencies. It does not run automatically during npm installation.

The executable is `tools/google-search-bootstrap/target/release/google-search-bootstrap` (`.exe` on Windows). `engine/` and `target/` are local build outputs and must not be distributed as package source. The fetched engine is [Apache-2.0 licensed](https://github.com/pierce403/mgbrowser/blob/fdf935c1a9a1446395cc61717b4a0d2047cd85b3/LICENSE); its [vendored Boa](https://github.com/pierce403/mgbrowser/tree/fdf935c1a9a1446395cc61717b4a0d2047cd85b3/vendor/boa_engine-0.22.0) uses the MIT license. Other Rust dependencies retain their respective licenses. Distributing a compiled helper requires preserving the applicable third-party notices.

## Process contract

The executable reads one JSON object from stdin and writes one JSON object to stdout. Errors before execution go to stderr with a nonzero exit status. Build logs are separate from the executable's protocol.

Input fields:

| Field | Contract |
| --- | --- |
| `url` | HTTPS `www.google.com/search` URL of the bootstrap response. |
| `html` | Recognized knitsail/challenge-version bootstrap HTML, at most 1 MiB. |
| `initialCookies` | Only JavaScript-readable cookies belonging to this anonymous HTTP session. Omit HttpOnly cookies. Defaults to empty. |
| `cryptoSeed` | Array of 32 fresh random bytes supplied by the caller. |

Output fields include `navigationUrl` (string or null), `cookieWrites` (document.cookie assignment strings), `errors`, `state`, `fetchRequestsNotExecuted`, `elapsedMs`, `engine`, and `userAgent`. The caller must validate the returned navigation against its original query and origin, put cookie writes into the same HTTP cookie jar, and preserve the matching user agent. Cookie values and computed navigation state must not be logged. A computed value by itself does not establish Google acceptance.

The process uses Boa's `InteractivePageV1` resource limits, a dedicated 32 MiB Rust stack, and bounded task pumping. The caller must enforce an overall process deadline, since one synchronous interpreter call can outlast the outer task-pump deadline. Script fetch intents are counted and left unexecuted. A challenge that requires unsupported work remains an explicit failure; no CAPTCHA handling, proxy or account session is supplied.
