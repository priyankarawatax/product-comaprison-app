import { useState } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { ComparisonRowList } from "../components/comparison-row-list";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { isRowOrder, readRowOrder, isDisabledRows, readDisabledRows, isMetafields, readMetafields, isRowLabels, readRowLabels, type ComparisonMetafield } from "../comparison-rows";
import db from "../db.server";
import { FeatureRequestButton } from "../components/feature-request";
import { SmartBadgeOption, type SmartBadgeKey, type SmartBadgeLabelKey } from "../components/smart-badge-option";
import { isReviewSettings, readReviewSettings, type ReviewSettings } from "../review-settings";
import { getStorePlanAccess } from "../billing/entitlements.server";

const settingsQuery = `#graphql
  query ComparisonRowSettings($namespace: String!, $rowOrder: String!, $disabledRows: String!, $productMetafields: String!, $rowLabels: String!, $reviewSettings: String!) {
    currentAppInstallation {
      id
      metafield(namespace: $namespace, key: $rowOrder) { value }
      disabled: metafield(namespace: $namespace, key: $disabledRows) { value }
      fields: metafield(namespace: $namespace, key: $productMetafields) { value }
      labels: metafield(namespace: $namespace, key: $rowLabels) { value }
      reviews: metafield(namespace: $namespace, key: $reviewSettings) { value }
    }
  }
`;
const settingsVariables = { namespace: "comparison", rowOrder: "row_order", disabledRows: "disabled_rows", productMetafields: "product_metafields", rowLabels: "row_labels", reviewSettings: "review_settings" };
const reviewSourceDescriptions: Record<ReviewSettings["source"], string> = {
  auto: "Automatically checks Shopify standard review metafields first, then common Loox and Stamped metafields. Use this when you are not sure which supported review source the store uses.",
  standard: "Reads reviews only from Shopify's standard reviews.rating and reviews.rating_count product metafields. No review-app-specific fallback is used.",
  custom: "Reads the rating and review count from the metafield namespace and key values you provide below. Use this for review apps that do not expose Shopify standard, Loox, or Stamped fields.",
};


type SmartBadgeSettings = { enabled: boolean; lowestPrice: boolean; bestRated: boolean; mostPopular: boolean; bestValue: boolean; maxPerProduct: number; lowestPriceLabel: string; bestRatedLabel: string; mostPopularLabel: string; bestValueLabel: string };
const defaultBadges: SmartBadgeSettings = { enabled: false, lowestPrice: true, bestRated: true, mostPopular: true, bestValue: true, maxPerProduct: 2, lowestPriceLabel: "Lowest Price", bestRatedLabel: "Best Rated", mostPopularLabel: "Most Popular", bestValueLabel: "Best Value" };
const smartBadgeOptions: Array<{ key: SmartBadgeKey; labelKey: SmartBadgeLabelKey }> = [
  { key: "lowestPrice", labelKey: "lowestPriceLabel" },
  { key: "bestRated", labelKey: "bestRatedLabel" },
  { key: "mostPopular", labelKey: "mostPopularLabel" },
  { key: "bestValue", labelKey: "bestValueLabel" },
];
function validBadgeLabel(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 40; }
function validBadgeLabels(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const badges = value as Record<string, unknown>;
  return smartBadgeOptions.every(({ labelKey }) => validBadgeLabel(badges[labelKey]));
}
function readBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return null;
}
function readBadgeSettings(value: unknown): SmartBadgeSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const badges = value as Record<string, unknown>;
  const max = typeof badges.maxPerProduct === "number" ? badges.maxPerProduct : Number(badges.maxPerProduct);
  const maxPerProduct = Number.isInteger(max) && max >= 1 && max <= 4 ? max : defaultBadges.maxPerProduct;
  return {
    enabled: readBoolean(badges.enabled) ?? defaultBadges.enabled,
    lowestPrice: readBoolean(badges.lowestPrice) ?? defaultBadges.lowestPrice,
    bestRated: readBoolean(badges.bestRated) ?? defaultBadges.bestRated,
    mostPopular: readBoolean(badges.mostPopular) ?? defaultBadges.mostPopular,
    bestValue: readBoolean(badges.bestValue) ?? defaultBadges.bestValue,
    maxPerProduct,
    lowestPriceLabel: validBadgeLabel(badges.lowestPriceLabel) ? badges.lowestPriceLabel.trim() : defaultBadges.lowestPriceLabel,
    bestRatedLabel: validBadgeLabel(badges.bestRatedLabel) ? badges.bestRatedLabel.trim() : defaultBadges.bestRatedLabel,
    mostPopularLabel: validBadgeLabel(badges.mostPopularLabel) ? badges.mostPopularLabel.trim() : defaultBadges.mostPopularLabel,
    bestValueLabel: validBadgeLabel(badges.bestValueLabel) ? badges.bestValueLabel.trim() : defaultBadges.bestValueLabel,
  };
}
export async function loader({ request }: LoaderFunctionArgs) {
  const { session,admin } = await authenticate.admin(request);
  const editor = `https://${session.shop}/admin/themes/current/editor`;
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY;
  // eslint-disable-next-line no-undef
  const embedHandle = process.env.SHOPIFY_COMPARE_EMBED_HANDLE || "app-embed";
  const embedLink = new URL(editor);
  embedLink.searchParams.set("context", "apps");
  if (apiKey) embedLink.searchParams.set("activateAppId", `${apiKey}/${embedHandle}`);
  const response = await admin.graphql(settingsQuery, { variables: settingsVariables });
  const result = await response.json();
  if (("errors" in result && result.errors) || !result.data?.currentAppInstallation) throw new Response("Unable to load table settings", { status: 502 });

  const settings = (await db.$queryRaw<Array<{ setupGuideDismissed: boolean; smartBadgesEnabled: boolean | number; badgeLowestPrice: boolean | number; badgeBestRated: boolean | number; badgeMostPopular: boolean | number; badgeBestValue: boolean | number; maxBadgesPerProduct: number; badgeLowestPriceLabel: string; badgeBestRatedLabel: string; badgeMostPopularLabel: string; badgeBestValueLabel: string }>>`
    SELECT setupGuideDismissed, smartBadgesEnabled, badgeLowestPrice, badgeBestRated, badgeMostPopular, badgeBestValue, maxBadgesPerProduct, badgeLowestPriceLabel, badgeBestRatedLabel, badgeMostPopularLabel, badgeBestValueLabel
    FROM stores WHERE shop = ${session.shop} LIMIT 1
  `)[0];

  const fields = readMetafields(result.data.currentAppInstallation.fields?.value);
  const badges = settings ? readBadgeSettings({ enabled: settings.smartBadgesEnabled, lowestPrice: settings.badgeLowestPrice, bestRated: settings.badgeBestRated, mostPopular: settings.badgeMostPopular, bestValue: settings.badgeBestValue, maxPerProduct: settings.maxBadgesPerProduct, lowestPriceLabel: settings.badgeLowestPriceLabel, bestRatedLabel: settings.badgeBestRatedLabel, mostPopularLabel: settings.badgeMostPopularLabel, bestValueLabel: settings.badgeBestValueLabel }) ?? defaultBadges : defaultBadges;
  const access = await getStorePlanAccess(session.shop);
  return { shop: session.shop, access, setupGuideDismissed: settings?.setupGuideDismissed ?? false, badges, reviewSettings: readReviewSettings(result.data.currentAppInstallation.reviews?.value), embedUrl: embedLink.toString(), fields, order: readRowOrder(result.data.currentAppInstallation.metafield?.value, fields), disabled: readDisabledRows(result.data.currentAppInstallation.disabled?.value, fields), labels: readRowLabels(result.data.currentAppInstallation.labels?.value, fields) };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  let order: unknown;
  try { order = JSON.parse(String(form.get("order"))); } catch { order = null; }
  let disabled: unknown;
  try { disabled = JSON.parse(String(form.get("disabled"))); } catch { disabled = null; }
  let fields: unknown;
  try { fields = JSON.parse(String(form.get("fields"))); } catch { fields = null; }
  let labels: unknown;
  try { labels = JSON.parse(String(form.get("labels"))); } catch { labels = null; }
  let reviewSettings: unknown;
  try { reviewSettings = JSON.parse(String(form.get("reviewSettings"))); } catch { reviewSettings = null; }
  const savesBadges = form.has("badges");
  let badges: SmartBadgeSettings | null = null;
  let badgeInput: unknown = null;
  if (savesBadges) {
    try { badgeInput = JSON.parse(String(form.get("badges"))); badges = readBadgeSettings(badgeInput); } catch { badges = null; }
  }
  if (!isMetafields(fields) || !isDisabledRows(disabled, fields) || !isRowOrder(order, fields) || !isRowLabels(labels, fields) || !isReviewSettings(reviewSettings)) return { success: false, error: "Invalid comparison table settings. Check the row labels and review data source.", order: null, disabled: null, fields: null, labels: null, badges: null, reviewSettings: null };
  if (savesBadges && (!badges || !validBadgeLabels(badgeInput))) return { success: false, error: "Invalid Smart Badge settings. Labels must be between 1 and 40 characters.", order: null, disabled: null, fields: null, badges: null };
  try {
    const access = await getStorePlanAccess(session.shop);
    const installation = await (await admin.graphql(settingsQuery, { variables: settingsVariables })).json();
    const ownerId = installation.data?.currentAppInstallation?.id;
    if (("errors" in installation && installation.errors) || !ownerId) throw new Error("Installation unavailable");
    const savedFields = readMetafields(installation.data.currentAppInstallation.fields?.value);
    const savedDisabled = readDisabledRows(installation.data.currentAppInstallation.disabled?.value, savedFields);
    const metafieldDisabledState = (values: string[], configuredFields: ComparisonMetafield[]) => configuredFields.map((field) => [field.id, values.includes(field.id)]);
    const metafieldLabels = (values: Record<string, string>, configuredFields: ComparisonMetafield[]) => configuredFields.map((field) => [field.id, values[field.id] ?? field.label]);
    const savedLabels = readRowLabels(installation.data.currentAppInstallation.labels?.value, savedFields);
    if (!access.entitlements.metafields && (JSON.stringify(fields) !== JSON.stringify(savedFields) || JSON.stringify(metafieldDisabledState(disabled, savedFields)) !== JSON.stringify(metafieldDisabledState(savedDisabled, savedFields)) || JSON.stringify(metafieldLabels(labels, savedFields)) !== JSON.stringify(metafieldLabels(savedLabels, savedFields)))) {
      return data({ success: false, error: "Product metafields are available on the Growth plan.", order: null, disabled: null, fields: null, labels: null, badges: null, reviewSettings: null }, { status: 403 });
    }
    if (!access.entitlements.smartBadges && badges) {
      const savedStore = (await db.$queryRaw<Array<{ smartBadgesEnabled: boolean | number; badgeLowestPrice: boolean | number; badgeBestRated: boolean | number; badgeMostPopular: boolean | number; badgeBestValue: boolean | number; maxBadgesPerProduct: number; badgeLowestPriceLabel: string; badgeBestRatedLabel: string; badgeMostPopularLabel: string; badgeBestValueLabel: string }>>`
        SELECT smartBadgesEnabled, badgeLowestPrice, badgeBestRated, badgeMostPopular, badgeBestValue, maxBadgesPerProduct, badgeLowestPriceLabel, badgeBestRatedLabel, badgeMostPopularLabel, badgeBestValueLabel
        FROM stores WHERE shop = ${session.shop} LIMIT 1
      `)[0];
      const savedBadges = savedStore ? readBadgeSettings({ enabled: savedStore.smartBadgesEnabled, lowestPrice: savedStore.badgeLowestPrice, bestRated: savedStore.badgeBestRated, mostPopular: savedStore.badgeMostPopular, bestValue: savedStore.badgeBestValue, maxPerProduct: savedStore.maxBadgesPerProduct, lowestPriceLabel: savedStore.badgeLowestPriceLabel, bestRatedLabel: savedStore.badgeBestRatedLabel, mostPopularLabel: savedStore.badgeMostPopularLabel, bestValueLabel: savedStore.badgeBestValueLabel }) : defaultBadges;
      if (JSON.stringify(badges) !== JSON.stringify(savedBadges)) {
        return data({ success: false, error: "Smart Badges are available on the Pro plan.", order: null, disabled: null, fields: null, labels: null, badges: null, reviewSettings: null }, { status: 403 });
      }
    }
    const response = await admin.graphql(`#graphql
      mutation SaveComparisonRowOrder($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `, { variables: { metafields: [{ ownerId, namespace: "comparison", key: "row_order", type: "json", value: JSON.stringify(order) }, { ownerId, namespace: "comparison", key: "disabled_rows", type: "json", value: JSON.stringify(disabled) }, { ownerId, namespace: "comparison", key: "product_metafields", type: "json", value: JSON.stringify(fields) }, { ownerId, namespace: "comparison", key: "row_labels", type: "json", value: JSON.stringify(labels) }, { ownerId, namespace: "comparison", key: "review_settings", type: "json", value: JSON.stringify(reviewSettings) }] } });
    const result = await response.json();
    if (("errors" in result && result.errors) || !result.data?.metafieldsSet || result.data.metafieldsSet.userErrors.length) throw new Error("Save failed");
    if (badges) {
      await db.$executeRaw`
        UPDATE stores SET smartBadgesEnabled = ${badges.enabled}, badgeLowestPrice = ${badges.lowestPrice}, badgeBestRated = ${badges.bestRated}, badgeMostPopular = ${badges.mostPopular}, badgeBestValue = ${badges.bestValue}, maxBadgesPerProduct = ${badges.maxPerProduct}, badgeLowestPriceLabel = ${badges.lowestPriceLabel}, badgeBestRatedLabel = ${badges.bestRatedLabel}, badgeMostPopularLabel = ${badges.mostPopularLabel}, badgeBestValueLabel = ${badges.bestValueLabel}
        WHERE shop = ${session.shop}
      `;
    }
    return { success: true, error: null, order, disabled, fields, labels, badges, reviewSettings };
  } catch {
    return { success: false, error: "Could not save the table settings. Please try again.", order: null, disabled: null, fields: null, labels: null, badges: null };
  }
}

export default function TableSettings() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [order, setOrder] = useState<string[]>(initial.order);
  const [disabled, setDisabled] = useState<string[]>(initial.disabled);
  const [fields, setFields] = useState<ComparisonMetafield[]>(initial.fields);
  const [labels, setLabels] = useState<Record<string, string>>(initial.labels);
  const [badges, setBadges] = useState<SmartBadgeSettings>(initial.badges);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings>(initial.reviewSettings);
  const [draft, setDraft] = useState({ label: "", namespace: "custom", key: "" });
  const [fieldError, setFieldError] = useState("");
  const saving = fetcher.state !== "idle";
  const saved = fetcher.data?.success ? fetcher.data : initial;
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved.fields) || JSON.stringify(order) !== JSON.stringify(saved.order) || JSON.stringify([...disabled].sort()) !== JSON.stringify([...(saved.disabled || [])].sort()) || JSON.stringify(labels) !== JSON.stringify(saved.labels) || JSON.stringify(badges) !== JSON.stringify(saved.badges) || JSON.stringify(reviewSettings) !== JSON.stringify(saved.reviewSettings);
  const updateBadges = (patch: Partial<SmartBadgeSettings>) => setBadges((value) => ({ ...value, ...patch }));
  const changedChecked = (value: unknown, current: boolean) => readBoolean(value) ?? !current;
  return (
    <s-page heading="Table settings">
      <FeatureRequestButton />
      <s-button slot="primary-action" variant="primary" commandFor="product-metafields-modal" command="--show" disabled={saving}>Add product metafield</s-button>
      <s-banner heading="Exclude products or collections" tone="info">
        To hide the compare button for a product, add the <s-text type="strong">no-comparison</s-text> tag to that product. To exclude an entire collection, open the <s-link href={initial.embedUrl}>Product Compare app embed in the Theme Editor</s-link> and select the collection under “Product comparison control.”
      </s-banner>
      <SaveBar id="comparison-table-save-bar" open={dirty || saving}>
        <button variant="primary" disabled={saving} onClick={() => { void fetcher.submit({ order: JSON.stringify(order), disabled: JSON.stringify(disabled), fields: JSON.stringify(fields), labels: JSON.stringify(labels), badges: JSON.stringify(badges), reviewSettings: JSON.stringify(reviewSettings) }, { method: "post" }); }}>Save</button>
        <button disabled={saving} onClick={() => { setOrder([...(saved.order || initial.order)]); setDisabled([...(saved.disabled || [])]); setFields([...(saved.fields || [])]); setLabels({ ...(saved.labels || initial.labels) }); setBadges(saved.badges || initial.badges); setReviewSettings(saved.reviewSettings || initial.reviewSettings); setFieldError(""); }}>Discard</button>
      </SaveBar>
      <s-section heading="">
        <s-heading fontSize="large-300">{`Comparison table rows`}</s-heading>
        <s-stack gap="base">
          <s-paragraph>Rename labels, drag the handle to reorder rows, and turn off rows you do not want to show. Use Save in the Shopify header to apply changes, then refresh the storefront.</s-paragraph>
          {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
          {fetcher.data?.success && !dirty && <s-banner tone="success">Table settings saved.</s-banner>}
          <ComparisonRowList customRows={fields} order={order} disabledRows={disabled} labels={labels} saving={saving} lockedRows={initial.access.entitlements.metafields ? [] : fields.map((field) => field.id)} onOrderChange={setOrder} onDisabledChange={setDisabled} onLabelChange={(id, label) => setLabels((current) => ({ ...current, [id]: label }))} />
           
        </s-stack>
      </s-section>
      <s-section heading="Review data">
        <s-stack gap="base">
          <s-select label="Review source" value={reviewSettings.source} disabled={saving} onChange={(event) => { const source = event.currentTarget.value as ReviewSettings["source"]; setReviewSettings((value) => ({ ...value, source })); }}>
            <s-option value="auto">Auto-detect</s-option><s-option value="standard">Shopify standard</s-option><s-option value="custom">Custom metafields</s-option>
          </s-select>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-paragraph>{reviewSourceDescriptions[reviewSettings.source]}</s-paragraph>
          </s-box>
          {reviewSettings.source === "custom" && <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
            <s-text-field label="Rating namespace" placeholder="loox" value={reviewSettings.ratingNamespace} disabled={saving} onInput={(event) => { const ratingNamespace = event.currentTarget.value.trim(); setReviewSettings((value) => ({ ...value, ratingNamespace })); }} />
            <s-text-field label="Rating key" placeholder="avg_rating" value={reviewSettings.ratingKey} disabled={saving} onInput={(event) => { const ratingKey = event.currentTarget.value.trim(); setReviewSettings((value) => ({ ...value, ratingKey })); }} />
            <s-text-field label="Review count namespace" placeholder="loox" value={reviewSettings.countNamespace} disabled={saving} onInput={(event) => { const countNamespace = event.currentTarget.value.trim(); setReviewSettings((value) => ({ ...value, countNamespace })); }} />
            <s-text-field label="Review count key" placeholder="num_reviews" value={reviewSettings.countKey} disabled={saving} onInput={(event) => { const countKey = event.currentTarget.value.trim(); setReviewSettings((value) => ({ ...value, countKey })); }} />
            <s-number-field label="Maximum rating scale" value={String(reviewSettings.maxScale)} min={1} max={10} step={1} disabled={saving} onChange={(event) => { const maxScale = Math.min(10, Math.max(1, Number(event.currentTarget.value) || 5)); setReviewSettings((value) => ({ ...value, maxScale })); }} />
          </s-grid>}
        </s-stack>
      </s-section>
      <s-section heading="Smart Badges">
        <s-stack gap="base">
          {!initial.access.entitlements.smartBadges && <s-grid gridTemplateColumns="minmax(0, 1fr) auto" gap="base" alignItems="center">
            <s-banner tone="info">Smart Badges are available on the Pro plan.</s-banner>
            <s-button href="/app/billing" variant="primary">Upgrade to Pro</s-button>
          </s-grid>}
          <s-paragraph>Highlight winners only within the products currently being compared. Popularity uses comparison opens from the last 90 days; Best Rated and Best Value use the configured review source.</s-paragraph>
          <s-switch label="Enable Smart Badges" checked={badges.enabled} disabled={saving || !initial.access.entitlements.smartBadges} onChange={(event) => updateBadges({ enabled: changedChecked(event.currentTarget.checked, badges.enabled) })} />
          <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
            {smartBadgeOptions.map(({ key, labelKey }) => <SmartBadgeOption key={key} badgeKey={key} labelKey={labelKey} settings={badges} saving={saving || !initial.access.entitlements.smartBadges} onChange={updateBadges} />)}
          </s-grid>
          <s-number-field label="Maximum badges per product" value={String(badges.maxPerProduct)} min={1} max={4} step={1} disabled={saving || !badges.enabled || !initial.access.entitlements.smartBadges} onChange={(event) => updateBadges({ maxPerProduct: Math.min(4, Math.max(1, Number(event.currentTarget.value) || 2)) })} />
          <s-box border="base" borderRadius="base" padding="base" background="subdued">
            <s-stack direction="inline" gap="small"><s-text>Preview:</s-text><s-badge tone="success">{badges.bestValueLabel}</s-badge><s-badge tone="info">{badges.lowestPriceLabel}</s-badge></s-stack>
          </s-box>
        </s-stack>
      </s-section>
      <s-modal id="product-metafields-modal" heading="Product metafields" size="large-100">
        <s-stack gap="base">
          {!initial.access.entitlements.metafields && <s-grid gridTemplateColumns="minmax(0, 1fr) auto" gap="base" alignItems="center">
            <s-banner tone="info">Product metafields are available on the Growth plan. Upgrade to add, remove, rename, or change their storefront visibility.</s-banner>
            <s-button href="/app/billing" variant="primary">Upgrade to Growth</s-button>
          </s-grid>}
          <s-paragraph>Add an existing product metafield using its namespace and key from Shopify Settings → Custom data → Products. Only enabled fields appear on the storefront. A product without a value shows a dash.</s-paragraph>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-text-field label="Row label" placeholder="Material" value={draft.label} disabled={saving || !initial.access.entitlements.metafields} onInput={(event) => { const label = event.currentTarget.value; setDraft((previous) => ({ ...previous, label })); }} />
          <s-text-field label="Namespace" placeholder="custom" value={draft.namespace} disabled={saving || !initial.access.entitlements.metafields} onInput={(event) => { const namespace = event.currentTarget.value; setDraft((previous) => ({ ...previous, namespace })); }} />
          <s-text-field label="Key" placeholder="material" value={draft.key} disabled={saving || !initial.access.entitlements.metafields} onInput={(event) => { const key = event.currentTarget.value; setDraft((previous) => ({ ...previous, key })); }} />
          </s-grid>
          {fieldError && <s-banner tone="critical">{fieldError}</s-banner>}
          <s-button disabled={saving || !initial.access.entitlements.metafields || fields.length >= 20} onClick={() => {
            const namespace = draft.namespace.trim(), key = draft.key.trim(), label = draft.label.trim();
            const field = { id: `metafield:${namespace}.${key}`, namespace, key, label };
            if (!isMetafields([...fields, field])) { setFieldError("Enter a label (up to 80 characters) and a valid, unique namespace and key. Use letters, numbers, underscores or hyphens; minimum 3 characters. Maximum 20 fields."); return; }
            setFields([...fields, field]); setOrder([...order, field.id]); setFieldError(""); setDraft({ label: "", namespace: "custom", key: "" });
          }}>Add metafield</s-button>
          {fields.map((field) => <s-box key={field.id} border="base" borderRadius="base" padding="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
              <s-stack><s-text>{field.label}</s-text><s-text color="subdued">{field.namespace}.{field.key}</s-text></s-stack>
              <s-button disabled={saving || !initial.access.entitlements.metafields} accessibilityLabel={`Remove ${field.label} from comparison settings`} onClick={() => { setFields(fields.filter((entry) => entry.id !== field.id)); setOrder(order.filter((id) => id !== field.id)); setDisabled(disabled.filter((id) => id !== field.id)); setLabels((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== field.id))); }}>Remove</s-button>
            </s-stack>
          </s-box>)}
          <s-paragraph>Added fields appear in the comparison row list, where you can change their position or turn them off. Close this modal and save your changes using the Shopify header. Removing a field here does not delete its product data.</s-paragraph>
        </s-stack>
        <s-button slot="primary-action" variant="primary" commandFor="product-metafields-modal" command="--hide">Done</s-button>
      </s-modal>
    </s-page>
  );
}
