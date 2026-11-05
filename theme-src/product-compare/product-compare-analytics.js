const supported = new Set(["product_compare_added", "product_compare_removed", "comparison_opened", "comparison_add_to_cart", "recommended_product_clicked", "product_viewed", "product_finder_opened"]);
let privacyReady;
let fallbackSession;
function privacy() {
  if (window.Shopify?.customerPrivacy) return Promise.resolve();
  privacyReady ||= new Promise((resolve) => {
    const finish = () => resolve();
    window.setTimeout(finish, 2000);
    try { window.Shopify?.loadFeatures?.([{ name: "consent-tracking-api", version: "0.1" }], finish); } catch { finish(); }
  });
  return privacyReady;
}
function sessionId() {
  const now = Date.now();
  try {
    const previous = JSON.parse(sessionStorage.getItem("product-compare:analytics-session") || "null");
    const id = previous?.id && now - previous.updatedAt < 30 * 60 * 1000 ? previous.id : crypto.randomUUID();
    sessionStorage.setItem("product-compare:analytics-session", JSON.stringify({ id, updatedAt: now }));
    return id;
  } catch { return fallbackSession ||= crypto.randomUUID(); }
}

// Best-effort telemetry: no awaiting from UI handlers, retries, or visible errors.
export function trackCompareEvent(eventType, data = {}, app = document.querySelector("product-compare-app")) {
  if (!supported.has(eventType) || !app || window.Shopify?.designMode) return;
  const comparedProductIds = [...new Set(data.comparedProductIds || (eventType === "comparison_opened" ? (app.items || []).map((item) => item.id) : []))].map(String).slice(0, 50);
  void (async () => {
    await privacy();
    if (!window.Shopify?.customerPrivacy?.analyticsProcessingAllowed()) return;
    const endpoint = new URL(app.dataset.analyticsEndpoint, location.origin);
    if (endpoint.origin !== location.origin) return;
    const body = {
      eventId: crypto.randomUUID(), eventType, sessionId: sessionId(),
      productId: data.productId || data.id ? String(data.productId || data.id) : undefined,
      variantId: data.variantId ? String(data.variantId) : undefined,
      comparedProductIds,
      source: data.source || (app.matches("product-finder-app") ? "product_finder" : app.sharedView ? "shared_comparison" : "comparison"),
    };
    await fetch(endpoint.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "same-origin" });
  })().catch(() => {});
}

void privacy();
document.addEventListener("product-compare:analytics", (event) => {
  if (event.target?.matches?.("product-compare-app, product-finder-app")) trackCompareEvent(event.detail?.eventType, event.detail, event.target);
});
// Recommendation widgets can opt in by marking a link and its product IDs.
// Regular storefront links and comparison PDP links are not recommendation clicks.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  const link = event.target.closest?.("a[data-compare-recommendation][data-product-id]");
  if (!link || !link.closest("product-compare-app, [data-product-compare-widget]")) return;
  trackCompareEvent("recommended_product_clicked", { productId: link.dataset.productId, variantId: link.dataset.variantId, source: "recommendation" });
});
