# Third-party components

The TypeScript SDK, local HTTP adapter and native bridge source in this repository are MIT licensed. Cloro's public documentation and SDK were inspected for interface organization; Cloro source code and backend are not included or called.

The npm dependency Acorn is MIT licensed and supplies its own license. The optional Python dependency curl_cffi is MIT licensed and includes separately licensed native dependencies in its own wheel distribution. It is installed into a local environment during explicit setup, not bundled into this npm artifact.

The optional runtime build fetches [pierce403/mgbrowser](https://github.com/pierce403/mgbrowser/tree/fdf935c1a9a1446395cc61717b4a0d2047cd85b3) at commit `fdf935c1a9a1446395cc61717b4a0d2047cd85b3`. The mg-sparkle library is Apache-2.0 licensed, with [patched Boa](https://github.com/pierce403/mgbrowser/tree/fdf935c1a9a1446395cc61717b4a0d2047cd85b3/vendor/boa_engine-0.22.0) under MIT. Other Rust dependencies retain their licenses. Engine source, compiled helpers and dependency caches are not included in the npm artifact. Redistributing compiled helpers requires retaining all applicable third-party notices and satisfying dependency license obligations.

Google Search scripts are obtained at request time and are not bundled with the SDK. Sanitized parser fixtures are recorded observations with hashes and provenance under tests/fixtures/google-search.
