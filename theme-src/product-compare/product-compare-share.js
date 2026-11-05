const STORAGE_KEY = "product-compare:list:v1";
const LIMIT = 10;

function status(app, text) {
  app.dialog.querySelector("[data-compare-share-status]").textContent = text;
}

export async function copyLink(app) {
  if (!app.items.length) return;
  if (app.items.some((item) => !item.variantId)) await app.loadDetails();
  if (app.items.some((item) => !item.variantId)) {
    status(app, "Some variants could not be loaded. Remove unavailable items and try again.");
    return;
  }
  const selectionLimit = Math.min(LIMIT, app.selectionLimit || LIMIT);
  if (app.items.length > selectionLimit) {
    status(app, `A link can share up to ${selectionLimit} variants. Remove some items and try again.`);
    return;
  }
  const entries = app.items.map((item) => {
    const handle = new URL(item.url, location.origin).pathname.split("/products/")[1].replace(/\/$/, "");
    return [item.id, item.variantId, handle];
  });
  const url = new URL(app.dataset.routesRoot || "/", location.origin);
  url.hash = new URLSearchParams({ compare: JSON.stringify({ v: 1, items: entries, s: app.similarities.checked, d: app.differences.checked }) }).toString();
  if (url.href.length > 12000) {
    status(app, "This comparison link is too long. Remove some items and try again.");
    return;
  }
  const input = app.dialog.querySelector("[data-compare-share-link]");
  input.value = url.href;
  try {
    await navigator.clipboard.writeText(url.href);
    input.hidden = true;
    status(app, "");
  } catch {
    input.hidden = false;
    input.focus();
    input.select();
    status(app, "Copy this link to share the comparison.");
  }
}

export function openShared(app) {
  try {
    const selectionLimit = Math.min(LIMIT, app.selectionLimit || LIMIT);
    if (location.hash.length > 12000) throw new Error("Invalid link");
    const payload = JSON.parse(new URLSearchParams(location.hash.slice(1)).get("compare"));
    if (payload?.v !== 1 || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > selectionLimit) throw new Error("Invalid link");
    const root = (app.dataset.routesRoot || "/").replace(/\/?$/, "/");
    const items = payload.items.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 3) throw new Error("Invalid item");
      const [id, variantId, handle] = entry;
      if (typeof id !== "string" || !/^\d+$/.test(id) || typeof variantId !== "string" || !/^\d+$/.test(variantId) || typeof handle !== "string" || !/^[a-zA-Z0-9%_-]+$/.test(handle)) throw new Error("Invalid item");
      const decoded = decodeURIComponent(handle);
      if (/[/?#\\.]/.test(decoded)) throw new Error("Invalid handle");
      return { id, variantId, key: id + ":" + variantId, title: decoded.replace(/-/g, " "), url: root + "products/" + handle + "?variant=" + variantId, image: "", price: "", vendor: "", type: "", sku: "", description: "", available: false };
    });
    app.items = [...new Map(items.map((item) => [item.key, item])).values()];
    app.sharedView = true;
    app.details.clear();
    app.similarities.checked = payload.s === true;
    app.differences.checked = payload.d === true;
    app.sync();
    app.openComparison();
    status(app, "Shared comparison. Product details reflect current store availability.");
  } catch {
    app.openComparison();
    status(app, "This comparison link is invalid. Your saved comparison has not changed.");
  }
}

export function removeAll(app) {
  try {
    if (!app.sharedView) localStorage.setItem(STORAGE_KEY, "[]");
    for (const item of app.items) app.track("product_compare_removed", { productId: item.id, variantId: item.variantId });
    app.items = [];
    app.details.clear();
    app.cartAdded.clear();
    app.dialog.querySelector("[data-compare-share-link]").hidden = true;
    app.dialog.querySelector("[data-compare-cart-status]").textContent = "";
    app.sync();
    status(app, "Comparison list cleared.");
    document.dispatchEvent(new CustomEvent("product-compare:change", { detail: { productIds: [] } }));
    if (app.dialog.open) app.dialog.close();
  } catch {
    status(app, "Your browser could not clear the comparison list. Please allow site storage and try again.");
  }
}
