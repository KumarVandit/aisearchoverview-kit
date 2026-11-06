# Cloudflare Workers

The `aisearchoverview-kit/workers` entry point is a fetch-only client. It has no Python, native executable, child-process, or local filesystem dependency. Bundle it with your Worker; no Node compatibility flag or runtime setup is required.

```ts
import { sdk } from 'aisearchoverview-kit/workers';

export default {
  async fetch() {
    const result = await sdk().overview.get('apartments in Austin Texas');
    return Response.json(result);
  },
};
```

This entry point provides runtime compatibility, not verified live Overview retrieval. All seven property queries tested on a deployed Free-plan Worker on November 6, 2026 received Google access-challenge redirects. None returned verified Overview text or citations. Do not use this entry point as a proven replacement for embedded retrieval.

`overview.parse()` can extract recognized Overview text and citations from supplied HTML without making requests. `overview.get()` uses ordinary fetch; missing or unsupported answer markup remains unverified. Access or HTTP failures remain explicit. No automatic session challenge solving or native-service fallback is included.

The Node entry point continues to use its separately installed embedded runtime by default. Changing between these entry points changes the retrieval mechanism and can change Google acceptance.

A fixed-query verification Worker is provided in `examples/cloudflare/worker.ts`. Its `/test?index=0` through `/test?index=6` routes accept POST requests, expose aggregate response diagnostics, and do not accept arbitrary search queries.
