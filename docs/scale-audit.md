# Bounded HTTP scale audit — 5 November 2026

**100 SDK calls completed in 70.407 seconds: 99 recognized Overviews, one unverified response, zero SDK errors and zero observed access-denial statuses.** Every final response exposed by the SDK had HTTP 200. This is evidence for this short, controlled workload, not production-scale parity, an IP rate limit, or a success guarantee.

The exact sanitized observations are in [scale-audit-results.json](scale-audit-results.json). No raw HTML, cookies, response headers, source URLs or error payloads were recorded.

## Workload and measurements

The run used the actual `sdk().overview.get()` path with its cached installed runtime, US/English, Markdown enabled and no custom fetch or browser fallback. Each call created a cold anonymous HTTP session; the compiled runtime and local dependencies were already installed. Four public queries were repeated in fixed round-robin order, 25 calls per query:

- why does the ocean look blue
- how to descale an electric kettle
- induction vs gas stove pros and cons
- best indoor plants for low light rooms

There were four distinct prompts and 96 repeated-query calls, **not 100 distinct prompts**. These prompts were selected from previously positive cases, so their Overview rate is not representative of arbitrary search traffic.

| Stage | Calls | Maximum SDK concurrency | Present | Unverified | Blocked/errors | p50 | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10 | 1 | 10 | 0 | 0 / 0 | 1,537 ms | 1,742 ms |
| 2 | 30 | 2 | 30 | 0 | 0 / 0 | 1,511 ms | 1,983 ms |
| 3 | 60 | 4 | 59 | 1 | 0 / 0 | 1,398 ms | 1,776 ms |
| Total | 100 | Up to 4 | 99 | 1 | 0 / 0 | 1,459 ms | 1,776 ms |

Latency covers one SDK operation through parsed result/error; percentile calculation uses nearest rank. The aggregate includes the unverified call. The run started at `2026-11-05T14:48:47.644Z`. Its wall duration excludes launching the TypeScript runner and installing runtime prerequisites. It does not measure rich browser-rendered UI latency.

A global gate enforced at least 500 ms between SDK call starts across stage boundaries. Recorded start timestamps show a minimum 500 ms interval. SDK concurrency is bounded separately from this launch rate. Scheduler tests verify both the gate and draining in-flight operations after a stop signal.

The sole unverified observation was call 68, the seventeenth occurrence of the indoor-plants query, with HTTP 200 and 1,387 ms latency. No raw response was retained, so this run cannot explain whether it lacked an Overview, used unsupported markup, or had another deferred state. Subsequent occurrences followed the existing schedule; none were retries triggered by that result.

## Upstream request and stop policy

Two SDK starts per second is **not** two upstream HTTP requests per second. The current Python driver requests Google's homepage and Search document, and may make one additional recognized bootstrap follow-up. A successful SDK operation therefore uses two or three upstream calls, while failures can terminate earlier. This run did not instrument or count individual upstream exchanges.

No proxies, imported browser cookies, fingerprint rotation, CAPTCHA completion, challenge-following retries or automatic request retries were used. The driver uses its existing embedded session-bootstrap implementation and fixed user-agent; it does not launch Chrome or another browser application. This is not a JavaScript-engine-free transport.

The harness stops new launches on SDK-observed `blocked`, HTTP 403/429, or HTTP 302 errors, and drains operations already in flight. Three SDK errors in a stage stop the audit rather than escalating concurrency. No stop trigger occurred. The driver currently masks some intermediate/homepage failures as generic network errors, so the harness cannot independently observe every upstream status or promise immediate status-specific stopping for those hidden exchanges.

## What this does not establish

- No block was observed at this workload; no rate-limit threshold was reached or discovered.
- IP address and route stability were not measured. A single machine/run cannot attribute behavior specifically to one IP or predict other networks.
- Other intentional SDK probes were paused, but previously opened browser tabs might have generated background traffic. This was not an isolated network experiment.
- Repeated queries can benefit from upstream caches. Cold local HTTP sessions do not prove uncached Google answers or independent generations.
- The run does not establish sustained throughput, regional diversity, long-duration reliability, 100-query diversity, or support for every rich Overview/AI Mode UI.

## Reproduce explicitly

```sh
npx tsx scripts/scale-audit.ts --live --output .probe/my-scale-audit/results.json
```

The script refuses to run without `--live` and an explicit output path. Its policy is fixed at stages 10/30/60 with concurrency 1/2/4 and a shared 500 ms start gate; it writes sanitized incremental JSON and progress events. Keep private diagnostics in ignored `.probe` paths. No extra network tests run in the default unit suite.


## Local queue stress and implemented controls

A separate offline audit submitted 10,000 jobs in each of three scenarios using explicit in-memory response doubles. Normal processing completed all 10,000 with peak concurrency four. On the first 429, the four already-started operations drained and 9,996 queued operations were rejected without upstream calls. Cancellation similarly prevented all 9,996 queued sends. These are queue-logic checks, not Google capacity, parser throughput or network benchmarks. See [local results](local-scale-audit-results.json).

The opt-in client `traffic` configuration now supplies a shared concurrency/start-spacing gate and denial cooldown, extended by Retry-After. `overview.batch(..., {deduplicate:true})` merges exact duplicate queries within one batch; a 100-entry/four-query test performs four fetches with independent result objects. No cross-batch cache, identity rotation, automatic retries or multi-machine coordinator is implemented. [Usage and boundaries](current-coverage.md).
