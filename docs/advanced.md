# Advanced controls

```ts
import {
  googleSearch,
  parseGoogleAiOverviewHtml,
  parseGoogleSearchHtml,
  parseGoogleSearchMonitorHtml,
} from 'aisearchoverview-kit/advanced';
```

The low-level Search client retains direct HTTP Search/autocomplete, explicit access classifications and an optional caller-owned browser Page. It is useful for custom transports and diagnostics. The main SDK uses the tested embedded HTTP path by default; the advanced client's default is plain fetch and may receive a JavaScript interstitial.

`embeddedSearchFetch({bootstrapExecutable, pythonExecutable?, ipFamily?})` provides the embedded fetch adapter directly. `ipFamily` accepts `'auto'` (default), `'ipv4'` or `'ipv6'` and controls only this adapter's HTTP connections. Explicit IPv4/IPv6 selections stay fixed; `auto` uses libcurl's normal connection selection. The adapter does not alter headers or retry denials using another family. When this adapter is passed as `sdk({fetch: adapter})`, configure the family on the adapter itself; the SDK rejects `ipFamily` alongside any caller-owned fetch instead of silently ignoring it.

The historical `monitor()` method and saved-HTML monitoring converters return a structured `success/result/aioverview` envelope. They are compatibility utilities, not a hosted platform or local REST service. Unsupported fields are rejected. Main SDK users should use `sdk().overview.get()` and the purpose-based result types instead.

