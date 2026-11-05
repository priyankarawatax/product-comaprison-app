// Product Ajax JSON does not include metafields. Read the public app-embed payload
// from each product page, which contains only fields selected by the merchant.
export async function loadMetafields() {
  let fields;
  let disabled;
  try {
    fields = JSON.parse(this.dataset.metafieldRows || "[]");
    disabled = JSON.parse(this.dataset.disabledRows || "[]") || [];
  } catch { return; }
  if (!Array.isArray(fields)) fields = [];
  const allowed = new Set(fields.filter((field) => !disabled.includes(field.id)).map((field) => field.id));
  const loadsReviews = Boolean(this.dataset.reviewSettings && this.dataset.reviewSettings !== "null");
  if (!allowed.size && !loadsReviews) return;
  this.metafieldRequests ||= new Map();
  await Promise.all([...new Map(this.items.map((item) => [item.id, item])).values()].map(async (item) => {
    let request = this.metafieldRequests.get(item.id);
    if (!request) {
      request = (async () => {
        let product;
        if (this.product?.id === item.id) product = JSON.parse(this.dataset.product || "null");
        else {
          const url = new URL(item.url, location.origin);
          if (url.origin !== location.origin || !url.pathname.includes("/products/")) throw new Error("Invalid product");
          url.search = "";
          const response = await fetch(url.href, { signal: this.events.signal });
          if (!response.ok) throw new Error("Product unavailable");
          const page = new DOMParser().parseFromString(await response.text(), "text/html");
          product = JSON.parse(page.querySelector("product-compare-app[data-product]")?.dataset.product || "null");
        }
        if (String(product?.id) !== item.id) throw new Error("Product mismatch");
        const metafields = Object.fromEntries(Object.entries(product.metafields || {}).filter(([key, value]) => allowed.has(key) && typeof value === "string").map(([key, value]) => [key, value.slice(0, 2000)]));
        const rating = +product.review?.rating;
        const count = +product.review?.count;
        const scale = +product.review?.scale;
        return { metafields, rating: Number.isFinite(rating) && scale > 0 ? Math.max(0, Math.min(5, rating / scale * 5)) : null, reviewCount: product.review?.count != null && Number.isSafeInteger(count) && count >= 0 ? count : null };
      })();
      this.metafieldRequests.set(item.id, request);
    }
    try {
      const { metafields, rating, reviewCount } = await request;
      const update = (entry) => entry.id === item.id ? { ...entry, metafields, rating, reviewCount } : entry;
      this.items = this.items.map(update);
      if (!this.sharedView) {
        try { localStorage.setItem("product-compare:list:v1", JSON.stringify(this.readSavedList().map(update))); } catch { /* Render without persistence. */ }
      }
    } catch {
      this.metafieldRequests.delete(item.id);
    }
  }));
  if (this.isConnected && this.dialog.open) this.renderList();
}
