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

The historical `monitor()` method and saved-HTML monitoring converters return a supported structured `success/result/aioverview` envelope. They are compatibility utilities, not a hosted platform or local REST service. Unsupported fields are rejected. Main SDK users should use `sdk().overview.get()` and the purpose-based result types instead.

