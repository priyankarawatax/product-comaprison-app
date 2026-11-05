> Historical quiz-only implementation notes. For the current result flow, see [Product Finder recommendations](product-finder-recommendations.md).

# Product Finder — Storefront quiz

This step adds the global floating button and quiz only. Product matching, recommendation cards, recommendation submission, comparison integration, and Finder analytics remain for the next step.

## Enable

1. Enable the existing Product Compare app embed in the theme editor and save the theme.
2. In the app's Product Finder page, add at least one active question with two answers, enable Product Finder, choose desktop/mobile visibility, and Save.
3. Refresh the storefront. The button appears across pages at the configured bottom-left or bottom-right position.

The Finder uses the same app embed and the existing /apps/product-comparison app proxy. There is no additional app embed to enable and no database migration. The running app backend and database must be available. The new configuration route is /proxy/product-finder. The theme calls its localized storefront proxy URL with routes.root_url.

## Behavior

The config request starts asynchronously when the embed loads. The button stays hidden until a valid enabled quiz is available; failures leave comparison and the rest of the theme alone. Product comparison exclusions do not exclude the Finder.

The modal opens only after a click. It displays active questions in saved order, one at a time. A radio answer is required before continuing. Back and closing/reopening preserve answers in memory on the current page. The final "Review answers" step shows the selected preferences. "Edit answers" returns to the last question; "Start again" clears the quiz. A page reload/navigation starts fresh. Answers are not sent to the server or saved in browser storage in this phase.

Native dialog behavior provides modal focus containment and Escape dismissal; closing restores focus. Mobile and desktop visibility follow the merchant's settings. The button moves above a visible comparison launcher when both use the same bottom corner.

## Security and future integration

The read-only route verifies Shopify's app proxy signature through authenticate.public.appProxy and checks session shop and timestamp. Queries are scoped to the authenticated installed store and return only display settings, version, active question text, and answer IDs/labels. Rules, weights, collection configuration, and credentials are not exposed. Responses are not cached.

On completion, the component emits the local DOM event product-finder:completed with finderId, version, and questionId/answerId pairs. This is only a future integration point, not a trusted recommendation request. The recommendation phase must revalidate all identifiers and resolve scoring rules server-side.

## Development checks

npm run typecheck
npm run build
node --test tests/product-finder.test.mjs tests/theme-liquid.test.mjs

The build writes the Finder bundle alongside the existing flat theme assets. No third-party storefront library is added.