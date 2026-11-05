# Product Compare theme extension

In the app admin, **Table settings** lets merchants drag comparison rows using their handles, toggle each row without visible status labels, and reset settings. Unsaved changes open the native Shopify header Save Bar with Save and Discard actions. The complete order and disabled-row list are validated on the authenticated server and stored atomically per installation in the `comparison.row_order` and `comparison.disabled_rows` JSON app-data metafields. Missing disabled-row settings enable all rows. The drag handles support mouse, touch and keyboard arrow keys. Product metafield values are not currently included in the comparison table. The embed reads it through `app.metafields.comparison.row_order.value`; refresh the storefront after saving. Missing or invalid settings fall back to the default rows. No theme file edits or additional access scopes are needed. Successful Copy link operations are silent; clipboard errors still expose a selectable link.

The modal header includes Copy link and Remove all. Share links encode up to 50 product/variant references and highlight preferences in the storefront URL fragment. Opening one automatically loads the same variants with current Shopify product details, without overwriting the recipient's saved comparison. The published storefront needs this extension version enabled; development-only previews do not make the feature available to other visitors. Password-protected stores still require store access. Clipboard failures expose a selectable link. Remove all clears the current comparison (shared views do not clear the recipient's saved list).

The extension lives in `extensions/product-compare`. It includes the `app-embed` body embed and an optional `comparison-block` product-page block. Both handles match the dashboard's automatic setup detection. Dashboard buttons now deep-link to these actual blocks.

## Enable in development

Run `npm run dev` and use its development-store preview. In the theme editor, open **App embeds → Product Compare**, turn it on, configure the settings, and **Save**. The embed's settings are Shopify's native theme-editor controls:

1. **Main button position:** Center left, Center right, Bottom right, Bottom left.
2. **Show notifications:** Toasts for adding/removing products. Storage errors are always announced.
3. **Hide main button on scroll:** Hides while scrolling, then reappears after 200 ms without scrolling. A keyboard-focused button stays visible.
4. **Button position:** Before or after Add to cart on eligible product pages.
5. **Button display:** Button or checkbox.
6. **Select collections:** Exclusion list. Empty means no collection restrictions. A product belonging to any excluded collection is hidden even on a direct product URL. The `no-comparison` tag also excludes a product. An excluded collection page hides the floating launcher.

The launcher opens a comparison dialog with saved product titles, prices, vendors, types and availability. Selection is per browser/storefront, not per customer account. Product information is a snapshot from the time it was added; it is not a live pricing feed. Changes synchronize across tabs through browser storage events.

Under **Floating button appearance**, customize the floating button text, filled/outline design, background/text/border colors, corner radius, font size and text weight. The count is appended automatically. The launcher stays vertical and 44px wide. Outline uses a transparent background; choose text and border colors that remain readable against your storefront.

The fullscreen dialog markup is defined in `blocks/app-embed.liquid`. It shows product images, product links, yellow Add to cart buttons for the exact saved variant and a Core specs table. Similarities highlights identical rows green; Differences highlights differing rows red. Both checkboxes can be enabled together and neither hides rows. On mobile the table scrolls horizontally and feature labels stay pinned; the header keeps the Close button accessible. Escape closes the dialog and closing restores page scrolling and launcher focus. Newly added products include images, SKU and description; older saved entries recover their product images automatically from the Shopify product Ajax API when the dialog opens. Image and title links open the product page. Cart actions use the locale-aware Shopify Ajax API and show success or error messages inside the dialog. Ratings and custom specifications are not included without a real data source.

## Placement and theme compatibility

Automatic controls target normal product forms with `/cart/add` actions, a variant `id` input, and a named `add` or submit button. Only the current product's variant IDs are accepted, so unrelated featured-product forms are skipped. Quick-add dialogs are excluded. Controls remount when theme sections re-render.

For themes with unusual forms, add **Comparison block** from **Add block → Apps** on the product template. It uses the embed's settings and exclusions. A manually positioned block takes priority over automatic before/after placement to prevent duplicate controls. The embed must also be enabled. The extension does not inject controls into collection product cards.

Buttons inherit the storefront theme's `button` classes and typography. The stylesheet only scopes the storefront control layout, floating positions, toast and comparison dialog; the admin dashboard remains Polaris-only.

## Development and verification

Edit `theme-src/product-compare/product-compare.js`; the file in the extension's `assets/` directory is generated and minified to meet Shopify's asset-size check. Source files stay outside the extension because Shopify only allows `assets`, `blocks`, `snippets`, and `locales` directories inside a theme extension. Run `npm run build:theme` after source edits. `npm run dev`, `npm run build` and `npm run deploy` rebuild it automatically through npm scripts. When using Shopify CLI directly, run the asset build first.

- `npm run test:theme`: DOM behavior and Liquid exclusion tests.
- `shopify app config validate --json`: Shopify configuration validation.
- `npm run typecheck`, `npm run lint`, `npm run build`: project checks.

Before production publication, verify the placement in the merchant's actual theme, both display modes, all four launcher positions, scroll behavior, exclusions, section reloads, keyboard navigation, and saving/reopening theme settings. Theme activation status in the dashboard reflects the **published** theme only.

This extension has not been deployed to production by this change.

References: [Theme app extension configuration](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration), [Shopify theme input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings).

Comparison entries are keyed by product ID and variant ID. The current product-form variant is captured when adding to comparison, including its price, SKU, image and variant-specific product URL. Different variants of the same product can be compared separately. Successful cart requests change the button to Added to cart and disable repeat submission for that entry during the current page session. Legacy entries without a recorded variant use the variant in their saved URL, or the first available variant when the original selection cannot be recovered.
