# Cloro parity contract review

Reviewed 5 November 2026 from primary documentation and the official Node SDK. This is a target contract, not a statement that the kit implements it. The source baseline was `d14bfb8`; implementation can advance independently of this inventory. [Machine-readable payload schemas and field inventory](parity-contract.json) retain functional types, references, constraints and required fields from the endpoint OpenAPI blocks, with source hashes. They omit descriptions and example payloads.

## Three distinct surfaces

| Surface | Cloro request | Response ownership |
| --- | --- | --- |
| Google Search with AI Overview | `monitor.google({query, ...})`, `include.aioverview` | `result.aioverview` is one section of the surrounding SERP. |
| Google AI Mode | `monitor.aimode({prompt, ...})` | `result` is the AI Mode answer and its widgets. |
| ChatGPT | `monitor.chatgpt({prompt, ...})` | `result` is one answer, or an array for a multi-turn prompt array. |

The user's “chat mode” can mean Google's AI Mode follow-up conversation or Cloro's separate ChatGPT provider. No generic `/monitor/chat` endpoint appears in the reviewed contract. Google follow-up state must be established from Google's own wire/runtime evidence; it cannot be implemented by relabeling the ChatGPT endpoint. [Google Search](https://cloro.dev/docs/api-reference/endpoint/monitor-google), [AI Mode](https://cloro.dev/docs/api-reference/endpoint/monitor-aimode), [ChatGPT](https://cloro.dev/docs/api-reference/endpoint/monitor-chatgpt).

## Overview and surrounding SERP

Overview's documented members are `text`, `markdown`, `sources`, `citationPills`, `relatedLinks`, `videos`, `places`, `map` and `ads`. Markdown is opt-in in Cloro; the kit defaults it on. A successful Cloro Search response can omit `aioverview` entirely when no Overview rendered. The kit's cautious `unverified` state is not equivalent to confirmed absence. Source/pill snippets need optional descriptions, and related links must remain separate from citation sources. [Overview](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview).

The parent Search result additionally includes organic results, sponsored ads, People Also Ask, related searches, People Are Saying, recipes, local results, knowledge graph, shopping cards and product results. They are not implied AIO children. Search accepts `query` or `url`, country/`gl`, `hl`, canonical `location` or `uule`, desktop/mobile device, pages and include flags; exact alternatives/defaults are recorded in the machine schema. These targeting options exceed the baseline root kit's country/language controls. [Search request and full schema](https://cloro.dev/docs/api-reference/endpoint/monitor-google).

| AIO child | Field contract and important distinction |
| --- | --- |
| Sources | `position`, `url`, `label`, `description`. Kit uses `title` instead of `label`. |
| Citation pills | One row per chip/source pair; shared one-based `citationPillId`, source `position`, `label`, `url`, `domain`, optional `description`. |
| Related links | `label`, `citationPillId`, `url`, `domain`, optional `description`; **no source position** and not counted as sources. |
| Videos | `url`, optional title/thumbnail/source/platform/date/duration metadata. Distinct from AI Mode's `link`/`channel` names. |
| Places/map | Delegates to AI Mode place/map schemas, including location data and KG identifiers. |
| Ads | Flat array with `position`, `title`, `url`, `type`; text and shopping variants add their own fields. Never infer ad status merely from commercial wording. |

Primary child schemas: [sources](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/sources), [citation pills](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/citation-pills), [related links](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/related-links), [videos](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/videos), [places/map](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/places-and-map), [ads](https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/ads).

## AI Mode

Inputs are `prompt`, country or `gl`, independent `hl`, `location` or `uule`, device and HTML/Markdown format flags. `prompt` and country/`gl` are required; location and uule are mutually exclusive. Results can contain text, HTML export, Markdown, sources, citation pills, places, shopping cards, an ad section, inline products, videos and map entries. Optional feature presence follows the actual answer, not the query category. [AI Mode endpoint](https://cloro.dev/docs/api-reference/endpoint/monitor-aimode).

| Widget | Fields / semantics |
| --- | --- |
| Sources | Common position/url/label/description shape. |
| Pills | One-based chip ID, per-source label/url/domain/optional description; source position can be absent when not in the rail. |
| Places | title/link/placeId/index/thumbnail/rating/reviews/type/priceLevel/address/phone/website/status. `placeId` is a Knowledge Graph ID, not a promise of a Maps API place ID. |
| Map | Similar place fields plus `gpsCoordinates.latitude/longitude`; join places by the KG ID when supplied. |
| Shopping cards | title/position/price/store/rating/reviews/thumbnail/productLink/productResultToken/productDocid/oldPrice/snippet/snippetLinks. Abbreviated reviews stay strings. |
| Inline products | title/position/price/oldPrice/store/thumbnail/productLink/productResultToken/productDocid. Distinct from grouped carousels. |
| Ads | **Object** `{title, ads: [...]}`; items include title/url/position/price/store/rating/reviews/imageUrl. It is not the AIO/ChatGPT flat-array shape. |
| Videos | title/**link**/platform/**channel**/duration/thumbnail; canonical watch links drop timestamps. |

Sources: [sources](https://cloro.dev/docs/api-reference/endpoint/aimode/sources), [pills](https://cloro.dev/docs/api-reference/endpoint/aimode/citation-pills), [places](https://cloro.dev/docs/api-reference/endpoint/aimode/places), [map](https://cloro.dev/docs/api-reference/endpoint/aimode/map), [shopping cards](https://cloro.dev/docs/api-reference/endpoint/aimode/shopping-cards), [inline products](https://cloro.dev/docs/api-reference/endpoint/aimode/inline-products), [ads](https://cloro.dev/docs/api-reference/endpoint/aimode/ads), [videos](https://cloro.dev/docs/api-reference/endpoint/aimode/videos).

AI Mode prices preserve raw text; unparseable numeric amounts stay absent. Currency can be a displayed symbol or structured ISO code. Monthly payments must not be silently promoted to a product's total price. Inline thumbnails can arrive as raster data URLs after Google's image loader, not only HTTPS resources. [Price and thumbnail rules](https://cloro.dev/docs/api-reference/endpoint/aimode/inline-products).

Merchant offer retrieval is another operation. Cloro's `productResultToken` is a Cloro-issued, five-minute handle consumed by `POST /v1/monitor/google/product`; it retains the scrape's locale/location/query. Cloro explicitly rejects handles it did not issue. Returning a native opaque Google token with that field name would not provide the same contract. Offers include name/link/price/installments/description/buyingOptions/logo/shipping/condition/rating/reviews/redirectLink. Product results can include descriptions, specifications, images, reviews, variants and related products. [Product endpoint](https://cloro.dev/docs/api-reference/endpoint/google/product), [AI Mode product results](https://cloro.dev/docs/api-reference/endpoint/aimode/product-results).

## ChatGPT and conversation behavior

The ChatGPT request accepts one prompt or up to five ordered prompts in the same conversation, with an array result for multiple turns. Options include country/state, format flags, raw response, search queries, shopping, ads, product details, legacy interface preference and disabling forced web search. Google AI Mode conversation support is not established by these ChatGPT options. [Request/multi-turn schema](https://cloro.dev/docs/api-reference/endpoint/monitor-chatgpt).

Cloro says its default ChatGPT interface can produce HTML-fragment streams, while its best-effort legacy preference can produce event streams. Model and query fan-out metadata may therefore be empty. Empty citations do not prove a transport failure or even that no search ran. A parser needs fixtures for both formats and must not invent missing metadata. [Interface and metadata caveats](https://cloro.dev/docs/api-reference/endpoint/monitor-chatgpt).

| Member | Distinction that affects implementation |
| --- | --- |
| text/markdown/html | Formats are separate; HTML is a hosted export URL in Cloro, not necessarily inline HTML. |
| sources | Includes optional publication dates and footnote indicators. |
| citationPills | **Zero-based** chip IDs, unlike Google's one-based IDs; includes type and optional publication date. Grouped web pages can omit descriptions. |
| shoppingCards | Grouped tags/products; product positions run across all groups. Availability varies by upstream model. |
| inlineProducts | `{product, render_as?}` with rich listing or minimal visible-card data; citationPillIds can connect product claims to answer citations. |
| entities | type/name and optional product listing; an entity need not have an offer. |
| map | Provider-specific business/place data; not the Google AIO map schema. |
| ads | Flat array of advertiser and carousel data, separately requested. |
| followUpForm | Structured questions/options, optional submit label and prompt template; `null` without a form. It is outside text/Markdown. |
| rawResponse | Event-stream records or HTML fragments; must handle both. |
| searchQueries/mapSearchQueries/model | May be empty/absent depending on response format and what upstream supplied. |

Sources: [sources](https://cloro.dev/docs/api-reference/endpoint/chatgpt/sources), [pills](https://cloro.dev/docs/api-reference/endpoint/chatgpt/citation-pills), [shopping cards](https://cloro.dev/docs/api-reference/endpoint/chatgpt/shopping-cards), [inline products](https://cloro.dev/docs/api-reference/endpoint/chatgpt/inline-products), [entities](https://cloro.dev/docs/api-reference/endpoint/chatgpt/entities), [map](https://cloro.dev/docs/api-reference/endpoint/chatgpt/map), [ads](https://cloro.dev/docs/api-reference/endpoint/chatgpt/ads), [follow-up form](https://cloro.dev/docs/api-reference/endpoint/chatgpt/follow-up-form).

Product details and visual assets extend beyond headline title/price: merchant offers, review rationale, image arrays, showcase layout/background/slot positioning and offer metadata have nested schemas. The machine inventory includes them; the answer's Markdown alone cannot represent this data without a separate asset/widget model. [Product details](https://cloro.dev/docs/api-reference/endpoint/chatgpt/product-details), [shopping product schema](https://cloro.dev/docs/api-reference/endpoint/chatgpt/shopping-cards).

## SDK structure and parity boundaries

The reviewed [official Node monitor resource](https://github.com/cloro-dev/cloro-node/blob/main/src/resources/monitor.ts) exposes `monitor.chatgpt`, `gemini`, `perplexity`, `copilot`, `aimode`, `google` and `googleNews`, returning hosted endpoint envelopes. Its return types are `Promise<any>` and includes allow extra keys; cloning that looseness would reduce this kit's typed contract. The [client](https://github.com/cloro-dev/cloro-node/blob/main/src/client.ts) also exposes hosted async tasks, API-key configuration, timeout/retry behavior and status errors. These platform concerns differ from extracting Google content locally.

At baseline, the root kit has Overview get/parse/batch and source resolution, country/language controls, recognized text/Markdown/citation extraction and explicit present/blocked/unverified states. It does not have AI Mode or ChatGPT retrieval/conversations, rich structured widgets, hosted HTML, product-handle storage, geographic exit infrastructure, webhook queues or service-level guarantees. The existing advanced Search monitor is a subset of the SERP contract, not a full equivalent.

Parity should be tracked per **surface × content/widget type × input targeting × transport × expansion/conversation state**. For each implemented item retain genuine sanitized input, expected text/Markdown and structured objects, asset references, source ownership and evidence of retrieval. Synthetic tests can define edge cases but cannot prove that Google/ChatGPT delivered that layout or that browser-free retrieval supports it. Unknown or omitted widget fields must not be filled from unrelated SERP modules, inferred from query text or manufactured to match Cloro's shape.


Scope clarification: the user confirmed “chat mode” means Google AI Mode follow-up conversations. ChatGPT material above is comparative research only and is outside this product implementation.
