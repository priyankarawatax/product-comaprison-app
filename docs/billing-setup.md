# Shopify App Pricing and MySQL setup

This public app uses Shopify App Pricing and verifies access with the Partner API `activeSubscription` query. It does not create charges with `appSubscriptionCreate` or `billing.request`.

## Partner Dashboard plans

Configure exactly these plans in Shopify:

| Plan | Monthly USD | Annual USD | Trial | Item handle |
| --- | ---: | ---: | --- | --- |
| Free | 0 | — | None | `free` |
| Growth | 4.99 | 49.90 | 5 days | `starter` |
| Pro | 9.99 | 99.90 | 5 days | `growth` |

Choose **Free** for Free and **Monthly with a yearly option** for Growth and Pro. Configure the 5-day trial on both paid plans in Shopify. The app only displays and records Shopify's trial; it never creates, restarts, or extends one. Set every plan's App Home welcome link to `/app/billing`.

The returned `activeSubscription.items[].handle` must match `SHOPIFY_*_ITEM_HANDLE`. Monthly and annual options for one tier use the same item handle and are distinguished by Shopify's verified `billingPeriod`. A development store can receive a zero effective price for a paid plan, so price is never used to identify access.

`items[].price.active` describes whether that catalog price is still offered. It can be `false` for an existing active contract after Shopify replaces the plan price, so entitlement identity comes from the active subscription's item handle rather than that catalog-price flag.

Plan access is defined in `app/billing/entitlements.ts`. Prices and display copy live in `app/billing/plans.ts`; the Partner Dashboard remains authoritative for the actual charge, interval, and trial.

## Credentials and database

Copy `.env.example` to `.env`. Configure MySQL 8 and a Partner API client with **Manage apps** permission:

- `SHOPIFY_PARTNER_ORGANIZATION_ID`
- `SHOPIFY_PARTNER_ACCESS_TOKEN`
- `SHOPIFY_PARTNER_APP_ID` using the numeric `gid://shopify/App/...`
- `SHOPIFY_APP_HANDLE` using the public listing handle

The app also accepts Shopify's official example names
`SHOPIFY_PARTNER_ORG_ID`, `SHOPIFY_PARTNER_API_ACCESS_TOKEN`, and
`SHOPIFY_APP_GID`. Do not configure both naming sets with different values.

Keep the Partner token server-side. Run `npm run setup` before starting the app.

The `subscription` table has one row per store because `storeId` is unique. It is a current verified snapshot, not billing history. It stores the recognized plan, item handle, Shopify billing period, amount/currency, cancellation state, trial/cycle dates, raw Partner response, and synchronization time.

## Billing lifecycle

1. Authenticated Shopify admin requests identify the shop. Browser-provided shop, plan, interval, and subscription-status values are never trusted.
2. `/app/billing` queries the Partner API and atomically upserts the subscription snapshot.
3. Upgrades, interval changes, and downgrades open Shopify's hosted pricing page. Shopify owns approval, decline, trial, proration, and the effective change date.
4. After approval or decline, `/app/billing` verifies `activeSubscription` again and publishes the verified storefront entitlement snapshot.
5. Protected server routes use a verified database snapshot for at most five minutes, then refresh it from the Partner API. A failed stale verification grants only Free access and retries after a short cooldown.
6. Pending downgrades retain the current active plan until Shopify makes the pending change effective.
7. The authenticated uninstall webhook marks the store and subscription inactive and removes sessions transactionally.

Shopify App Pricing does not send `APP_SUBSCRIPTIONS_UPDATE` notifications. The app therefore reconciles on the pricing page and on protected requests when the snapshot is stale. Refreshes are deduplicated per store within one process. Because the Partner API limit is organization-wide, a multi-instance high-traffic deployment should add a shared rate limiter or reconciliation queue.

## Data preservation and storefront access

Downgrades never delete Product Finder configuration/questions, comparison configuration, metafield configuration, analytics history, or Smart Badge settings. Server routes enforce the current plan. The theme receives only a boolean entitlement snapshot and does not receive Partner credentials or trust browser plan values.

## Development-store QA

- Approve Free, Growth Monthly, Growth Yearly, Pro Monthly, and Pro Yearly.
- Verify item handle, billing period, price/currency, trial end, cycle dates, status, and `syncedAt` in MySQL.
- Decline an approval and confirm the previously active plan remains authoritative.
- Test a scheduled downgrade and confirm access changes only when Shopify changes the active subscription.
- Open a forged URL containing plan or interval parameters and confirm it grants nothing.
- Test missing Partner credentials, unknown item handles, cancellation, uninstall, and reinstall.

Run `npm run test:billing`, `npm run typecheck`, `npx prisma validate`, `npm run build`, and `npm run lint`.

References: [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing), [subscription setup](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/subscription-billing/setup-subscription-charges), [hosted plan selection](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/redirect-plan-selection-page), and [Partner active subscription](https://shopify.dev/docs/api/partner/2026-07/active-subscription).
