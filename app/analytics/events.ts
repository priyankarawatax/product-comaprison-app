export const EVENT_TYPES = [
  "product_compare_added", "product_compare_removed", "comparison_opened",
  "comparison_add_to_cart", "recommended_product_clicked", "product_viewed", "product_finder_opened",
] as const;
export type AnalyticsEventType = typeof EVENT_TYPES[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const productId = /^[1-9][0-9]{0,19}$/;
const sources = ["comparison", "recommendation", "shared_comparison", "product_finder"];
export function parseAnalyticsEvent(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.eventType !== "string" || !EVENT_TYPES.includes(value.eventType as AnalyticsEventType)) return null;
  if (typeof value.eventId !== "string" || !uuid.test(value.eventId)) return null;
  if (typeof value.sessionId !== "string" || !uuid.test(value.sessionId)) return null;
  for (const key of ["productId", "variantId"]) {
    if (value[key] != null && (typeof value[key] !== "string" || !productId.test(value[key] as string))) return null;
  }
  if (!["comparison_opened", "product_finder_opened"].includes(value.eventType) && !value.productId) return null;
  if (value.variantId && !value.productId) return null;
  const ids = value.comparedProductIds ?? [];
  if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== "string" || !productId.test(id))) return null;
  // Do not store arbitrary client metadata, URLs, customer IDs or client timestamps.
  const source = typeof value.source === "string" && sources.includes(value.source) ? value.source : "comparison";
  return {
    eventId: value.eventId, sessionId: value.sessionId,
    eventType: value.eventType as AnalyticsEventType,
    productId: (value.productId as string | undefined) || null,
    variantId: (value.variantId as string | undefined) || null,
    comparedProductIds: [...new Set(ids as string[])], metadata: { source },
  };
}
