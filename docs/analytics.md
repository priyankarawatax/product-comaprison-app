# Comparison analytics MVP

The Analytics navigation item shows 7/30/90-day UTC reports (30 days by default): opens, items added, Add to Cart clicks, click/open conversion rate, daily activity, top ten products, and top ten product pairs. Conversion is not an order or revenue metric; multiple clicks per open can exceed 100%. The last day is partial. Product names use one Admin API lookup for the displayed IDs, with ID fallbacks for unavailable products.

## Enable in a store

1. Apply the Prisma migration with `npm run prisma -- migrate deploy`, and regenerate the client with `npm run prisma -- generate`. Restart a running dev server after regeneration.
2. Publish/sync the app configuration and theme extension through the project's usual Shopify workflow. The configuration adds `write_app_proxy` and the `/apps/product-comparison` app proxy. Approve the updated permission in the development store if Shopify prompts for it.
3. Keep the app embed enabled. The extension POSTs to `/apps/product-comparison/analytics` (locale-aware). If a merchant customizes the app proxy path, update `data-analytics-endpoint` in the embed to match.

The app proxy must be active and the backend reachable before events can be recorded. Analytics does not backfill past activity. Theme editor interactions and visitors who have not allowed analytics processing are excluded.

## Events and safeguards

- `product_compare_added` / `product_compare_removed`: successful local comparison-list changes, including Remove all (one event per selected variant).
- `comparison_opened`: opening a closed comparison modal, including shared links; renders and highlights do not count. Up to 50 unique product IDs form the comparison snapshot. Multiple variants of one product contribute that product only once to pairs.
- `comparison_add_to_cart`: a valid comparison Add to Cart click, before the cart request. Failed cart requests still count as clicks; rendering and disabled clicks do not count.
- `recommended_product_clicked`: supported for app-owned recommendation links described below. The current app has no recommendation widget, so this remains empty until one is implemented.
- `product_viewed`: accepted by the helper/endpoint for future app-widget view metrics, but not automatically emitted. General storefront product views are not tracked.

`trackCompareEvent(eventType, data, app)` is exported from `theme-src/product-compare/product-compare-analytics.js`. Comparison components emit the internal `product-compare:analytics` event through `app.track()`. A recommendation anchor within `product-compare-app` or `[data-product-compare-widget]` can use `data-compare-recommendation`, `data-product-id` and optional `data-variant-id` to opt into click tracking. Do not also call the helper for that same anchor click.

The Shopify customer privacy API gates analytics processing. Anonymous random session IDs expire after 30 minutes of inactivity, live in sessionStorage, and fall back to page memory if storage is blocked. No names, emails, IP addresses, raw URLs, customer IDs, or arbitrary metadata are stored. Consent denial/API unavailability drops events without blocking the feature.

The endpoint verifies Shopify's app-proxy signature, the authenticated installed shop, and a recent signed timestamp. It bounds request size, validates event names and identifiers, generates timestamps on the server, ignores browser shop values and arbitrary metadata, and deduplicates event UUIDs per shop. Best-effort database-backed limits cap recorded events at 120 per anonymous session and 5,000 per shop per minute. As with any public analytics endpoint, client events are untrusted telemetry, not proof of purchases or human activity. These count-based limits are not an anti-bot service.

Every report filters by the authenticated admin session's shop. MySQL performs all grouping; Node only fills missing chart days and converts aggregate numeric types. `analytics_comparison_products` stores a normalized, deduplicated product set per open event so pair counts use a database self-join, without reading raw event lists into JavaScript or relying on MySQL 8-specific JSON functions. Nested writes make the event and comparison snapshot atomic.

No chart library or external analytics service is installed. The responsive SVG chart includes a textual screen-reader description. Event delivery is asynchronous and best effort, so blocked/offline requests may be absent from reports.
