# Product Finder — Phase 1

This phase provides admin configuration only. There is no storefront code, scoring engine, recommendation endpoint, product caching, or Finder event tracking.

## Configuration

Open Product Finder in the app navigation. The native Shopify Save Bar saves all settings and questions atomically; Discard restores the last saved snapshot. The feature is disabled by default. The enable switch stores the intended status for the later storefront phase.

Settings include button text and left/right position, desktop/mobile visibility, finder title and description, result heading, and recommendation count (default 3, supported range 1–10). The source is all products or exactly one collection selected through Shopify's resource picker. The action verifies that collection through the authenticated store's API before saving.

Questions can be created, edited, removed, dragged into order, and toggled active/inactive. Answers support editing and ordering. Removals take effect only on Save and are limited to this store's Finder records. Active questions need 2–20 answers; up to 20 questions are supported. Inactive questions can have no answers. Enabling a Finder requires an active question and at least one device enabled.

Every answer stores label, canonical field, operator, match value, integer weight (1–100), and zero-based position:
- price: values in the store currency's main units (500 means 500 currency units), numeric operators except contains.
- vendor, product_type, tags: equals or contains.
- availability: equals with true/false.
- variant_option.Color (or another exact option name): equals or contains.
- metafield.custom.material (namespace/key entered in the editor): all six requested operators. Ordered comparisons require numeric values.

These are saved rule definitions, not a matching implementation. The scoring semantics and product loading belong to the later phase.

The admin preview shows the current button text/placement/device choices and a Polaris modal containing the title, description, first active question's answers, result heading, and recommendation limit. It does not query or recommend products.

## Persistence and safety

ProductFinder has a unique storeId relationship. Question and answer tables have parent relations and position indexes. All loader/action store lookups derive from authenticate.admin(request). Submitted store/finder IDs are never used to choose an owner. Save validates rule types, limits, identifiers and parent ownership on the server.

A per-store transactional lock and version number prevent stale concurrent saves from overwriting newer data. IDs of existing questions and answers are preserved across edits. Validation/ownership/collection errors leave the draft intact. The additive migration only creates the three Finder tables; it does not alter existing store, comparison or analytics rows.

Apply the migration with npm run prisma -- migrate deploy and regenerate with npm run prisma -- generate before starting the updated server. A running Windows dev server may need stopping first if it locks Prisma's engine DLL.
