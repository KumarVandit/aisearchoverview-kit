# SDK API

Import `sdk`, `AiSearchError`, public types and runtime setup from `aisearchoverview-kit`. Both ESM and CommonJS expose the same API.

## Configuration

```ts
const search = sdk({
  locale: { country: 'US', language: 'en' },
  transport: 'embedded',
  timeoutMs: 20_000,
});
```

`KitConfig` also accepts `fetch`, `cacheDirectory`, `bootstrapExecutable` and `pythonExecutable`. Supplying a custom fetch defaults the transport to `http`; it must support the standard fetch signal contract. Embedded mode uses the optional installed runtime. Construction and offline parsing do not build or execute it.

## overview.get

`get(query: string, options?: OverviewOptions): Promise<OverviewResult>`

| Option | Meaning |
| --- | --- |
| `country` | Uppercase two-letter Google country parameter; default `US`. This is not a guaranteed physical exit location. |
| `language` | Google language code; default `en`. |
| `markdown` | Include extracted Markdown; default true. |
| `signal` | Caller cancellation; its original reason is preserved. |

The discriminated `OverviewResult` has a `status`, `query`, `reason`, `sources` and `metadata`. A `present` result additionally guarantees `text: string` and may have `markdown`. A `blocked` or `unverified` result does not contain fabricated answer text.

`OverviewSource` contains `position`, `title`, `url` and optional `redirectUrl`. Positions are one-based. `url` may initially be an opaque Google citation URL. A publisher's title is not used to guess its URL.

`OverviewMetadata` contains `country`, `language`, `transport`, `durationMs`, optional `sourceUrl`/`httpStatus`, `warnings`, and `completeness: 'unverified'`. Request duration includes retrieval, bootstrap and parsing. Snapshot duration describes local parsing, not Google's generation time.

## overview.parse

`parse(html: string, options: ParseOverviewOptions): OverviewResult`

`sourceUrl` is required and must identify a normal Google Search response. Query defaults to that URL's `q`; an explicit query must agree with it. Country, language and Markdown options have the same meaning as `get`. Parsing performs no requests and executes no scripts. Only supported, unconditional literal HTML transfers associated with an actual Overview placeholder are reconstructed.

## overview.batch

`batch(queries: readonly string[], options?: OverviewBatchOptions): Promise<OverviewBatchItem[]>`

Adds `concurrency` from 1 to 8, default 2. Output order matches input order. Each item is `{query, ok: true, overview}` or `{query, ok: false, error: {kind, message}}`. A blocked/unverified Overview is a completed observation with `ok: true`; an exception has `ok: false`. Cancellation rejects the batch with the caller's reason. This is bounded local collection, not a hosted task queue.

## sources.resolve

`resolve(sources: readonly OverviewSource[], options?: {signal?: AbortSignal}): Promise<SourceResolutionResult>`

Returns a copied source list, resolved count and warnings. Only HTTPS `www.google.com/url` and `/goto` citation links are requested, with redirects disabled. A single HTTP redirect can establish a publisher URL; publisher pages are never fetched. Failures preserve the original source and add a warning. Existing direct publisher links require no request. This operation is optional and adds retrieval time.

## Errors

`AiSearchError` has `kind: 'configuration' | 'validation' | 'network' | 'http' | 'parse' | 'timeout'` and optional HTTP `status`. A missing native runtime is a configuration error with the setup command. Access challenges and unsupported layouts remain explicit result states. Automatic retries are not performed.


## Citation groups and content formatting

Present results can include `citationPills` when recognized inline citation markup supplies them. Each `OverviewCitationPill` has `citationPillId`, `position`, `label`, `url` and `domain`. `position` is a one-based index into `sources`, not a sentence offset. Simplified responses may omit the array.

Markdown preserves code blocks and basic tables in supplied semantic HTML. This does not guarantee the HTTP session receives those richer layouts. Structured related links, video cards, places, maps and AIO ads are not implemented. See the [layout audit](layout-coverage.md) for real versus synthetic coverage and current limitations.
