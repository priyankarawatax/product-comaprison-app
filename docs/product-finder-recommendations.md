# Product Finder — Recommendations

The storefront quiz now requests real weighted recommendations after the final answer. No Prisma migration or additional library is required.

## Scoring and catalog

The server resolves one saved answer per active question and rejects stale Finder versions, foreign question/answer IDs, duplicates and missing answers. Client-supplied weights or rules have no effect.

Every matching rule adds its saved weight. Match percentage is score / sum of selected-answer weights * 100, rounded to one decimal place. All rules are evaluated on the same variant, so a product cannot combine a cheap red variant's price with an expensive blue variant's color. Each product appears once with its highest-scoring variant. Ties prefer available variants, then lower price, then stable IDs. Products with no matching rules are excluded. The configured result count limits the output to 1–10 products.

Supported values: price, vendor, product type, tags, availability, named variant options, and product text/number/boolean/date/color/URL metafields or primitive lists. Text comparisons are trimmed and case-insensitive; tag/list equality matches an individual element. Numeric comparisons reject missing/empty/non-numeric values. Reference/structured JSON metafields are not resolved into labels.

Price rules use the store's base currency, as configured in Phase 1. Result cards fetch current product JSON through the localized storefront route to show current storefront currency, images and the exact recommended variant. Market-specific pricing is not used to reinterpret merchant-authored budget rules.

The Admin API query paginates all matching published active Online Store variants, optionally within the selected collection. Products without an Online Store URL are excluded. Only metafields referenced by selected answers are read. Product variant pagination avoids the common first-variant or first-250-products truncation.

A per-process cache is isolated by shop, collection, Finder version and requested metafields. Its TTL is 60 seconds, with at most five cached/running catalog loads; identical requests share the in-flight load. A per-shop request limit protects the endpoint. GraphQL cost information controls paging delays. Catalog loads stop with a retryable error after the 45-second paging budget or 20,000 eligible variants; partial catalogs are never returned as complete recommendations. A smaller configured collection is the MVP fallback for oversized catalogs. Multiple app processes maintain separate caches/limits.

## Results and comparison

Cards show match percentage, current price, product image/title, variant, View product and Compare. "Compare recommended products" adds eligible results and opens the existing table. Existing selections remain; already-selected variants are never toggled off. The comparison component's original toggle/storage/event path handles additions. Shared comparison views retain their separate in-memory list. Products tagged no-comparison cannot be added from Finder.

PDP links include the selected variant. Recommended-link clicks reuse the existing recommended_product_clicked tracker and its consent handling. Comparison adds/opens continue through existing comparison analytics. Dedicated Finder funnel metrics are not added in this step.

Back/Edit answers retains choices, retry recovers from API failures, and Start again resets the quiz. No matches produces an empty state without inventing fallback matches. Answers are posted for this response but are not persisted.

## API and safety

GET /proxy/product-finder still serves public quiz display configuration.
POST /proxy/product-finder returns heading and minimal recommendation IDs/handles/scores.

Both are reached through the signed /apps/product-comparison/product-finder proxy. POST validates the authenticated shop, timestamp, installed store, enabled Finder/version and answer ownership; JSON bodies are bounded to 8 KB. All matching rules and Admin credentials remain server-side. Response caches are disabled. Current storefront product fetches omit unpublished/deleted variants before displaying results.

## Checks

- npm run typecheck
- npm run build
- node --import tsx --test tests/product-finder-scoring.test.mjs
- node --test tests/product-finder.test.mjs tests/product-finder-results.test.mjs tests/theme-liquid.test.mjs

Shopify reference: https://shopify.dev/docs/api/admin-graphql/2026-10/queries/productVariants