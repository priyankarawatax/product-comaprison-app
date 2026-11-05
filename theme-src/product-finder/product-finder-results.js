const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const safeImage = (value) => {
  try {
    const url = new URL(value || "", location.origin);
    return value && url.protocol === "https:" && (url.origin === location.origin || url.hostname === "cdn.shopify.com") ? url.href : "";
  } catch { return ""; }
};
const formatPopularPrice = (app, value) => {
  const amount = typeof value === "number" ? value / 100 : Number(value);
  if (!Number.isFinite(amount)) return "";
  const currency = app.dataset.currency || window.Shopify?.currency?.active || "USD";
  try { return new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency }).format(amount); }
  catch { return amount.toFixed(2) + " " + currency; }
};
const normalizePopularProduct = (app, product) => {
  if (!product || !/^[1-9][0-9]*$/.test(String(product.id)) || typeof product.handle !== "string" || !product.handle
    || typeof product.title !== "string" || !product.title || String(product.id) === app.dataset.productId) return null;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = variants.find((item) => item?.available === true);
  if (product.available === false || (variants.length && !variant)) return null;
  const imageValue = variant?.featured_image?.src || product.featured_image?.src || product.featured_image
    || product.images?.[0]?.src || product.images?.[0];
  const price = formatPopularPrice(app, variant?.price ?? product.price);
  if (!price) return null;
  const root = app.dataset.routesRoot || "/";
  const productUrl = new URL((root.endsWith("/") ? root : root + "/") + "products/" + encodeURIComponent(product.handle), location.origin);
  if (variant?.id) productUrl.searchParams.set("variant", String(variant.id));
  return { id: String(product.id), title: product.title.slice(0, 300), price, image: safeImage(imageValue), url: productUrl.pathname + productUrl.search };
};
async function loadPopularProducts(app, signal) {
  const root = app.dataset.routesRoot || "/";
  const base = root.endsWith("/") ? root : root + "/";
  const endpoints = [];
  if (/^[1-9][0-9]*$/.test(app.dataset.productId || "")) endpoints.push(base + "recommendations/products.json?product_id=" + encodeURIComponent(app.dataset.productId) + "&limit=4&intent=related");
  if (/^[a-z0-9][a-z0-9-]*$/.test(app.dataset.collectionHandle || "")) endpoints.push(base + "collections/" + encodeURIComponent(app.dataset.collectionHandle) + "/products.json?limit=12");
  endpoints.push(base + "collections/all/products.json?limit=12");
  const picks = [];
  const seen = new Set();
  for (const endpoint of [...new Set(endpoints)]) {
    if (picks.length >= 4) break;
    try {
      const response = await fetch(new URL(endpoint, location.origin), { headers: { Accept: "application/json" }, credentials: "same-origin", signal });
      if (!response.ok) continue;
      const payload = await response.json();
      const products = Array.isArray(payload.products) ? payload.products : [];
      products.sort((a, b) => Number(String(b.vendor || "").toLocaleLowerCase() === String(app.dataset.productVendor || "").toLocaleLowerCase()) - Number(String(a.vendor || "").toLocaleLowerCase() === String(app.dataset.productVendor || "").toLocaleLowerCase()));
      for (const product of products) {
        const pick = normalizePopularProduct(app, product);
        if (!pick || seen.has(pick.id)) continue;
        seen.add(pick.id); picks.push(pick);
        if (picks.length === 4) break;
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  return picks;
}
function renderNoMatch(app, area) {
  const state = element("section", undefined, "pf-no-match");
  const body = element("div", undefined, "pf-no-match-body");
  const heading = typeof app.config?.noMatchHeading === "string" && app.config.noMatchHeading.trim() ? app.config.noMatchHeading : "No matching products found";
  const description = typeof app.config?.noMatchDescription === "string" && app.config.noMatchDescription.trim() ? app.config.noMatchDescription : "We couldn't find an exact match based on your selections. But you might like these popular picks instead.";
  body.append(element("h3", heading, "pf-no-match-title"), element("p", description, "pf-no-match-description"));
  const picks = app.results?.popularProducts || [];
  if (picks.length) {
    const recommendations = element("section", undefined, "pf-popular");
    recommendations.setAttribute("aria-labelledby", "pf-popular-title");
    const title = element("h4", "Popular picks for you", "pf-popular-title"); title.id = "pf-popular-title";
    const list = element("div", undefined, "pf-popular-list");
    for (const product of picks) {
      const link = element("a", undefined, "pf-popular-card"); link.href = product.url;
      if (product.image) { const image = element("img"); image.src = product.image; image.alt = ""; image.loading = "lazy"; image.width = 96; image.height = 96; link.append(image); }
      const details = element("span", undefined, "pf-popular-details");
      details.append(element("span", product.title, "pf-popular-name"), element("span", product.price, "pf-popular-price"));
      link.append(details); list.append(link);
    }
    recommendations.append(title, list); body.append(recommendations);
  }
  state.append(body); area.append(state);
}
async function hydrate(app, product, signal) {
  if (!/^[1-9][0-9]*$/.test(product.id) || !/^[1-9][0-9]*$/.test(product.variantId)
    || typeof product.handle !== "string" || !product.handle || product.handle.length > 255
    || !Number.isFinite(product.matchPercentage) || product.matchPercentage < 0 || product.matchPercentage > 100) throw new Error("Invalid recommendation");
  const root = app.dataset.routesRoot || "/";
  const path = (root.endsWith("/") ? root : root + "/") + "products/" + encodeURIComponent(product.handle);
  const url = new URL(path + ".js", location.origin);
  if (url.origin !== location.origin) throw new Error("Invalid product URL");
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load current product details. Please try again.");
  const data = await response.json();
  if (String(data.id) !== product.id || !Array.isArray(data.variants)) return null;
  const variant = data.variants.find((entry) => String(entry.id) === product.variantId);
  if (!variant) return null;
  const priceAmount = Number(variant.price);
  if (!Number.isFinite(priceAmount)) return null;
  const currency = app.dataset.currency || window.Shopify?.currency?.active || "USD";
  let price;
  try { price = new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency }).format(priceAmount / 100); }
  catch { price = (priceAmount / 100).toFixed(2) + " " + currency; }
  const productUrl = new URL(path, location.origin);
  productUrl.searchParams.set("variant", product.variantId);
  const tags = Array.isArray(data.tags) ? data.tags : String(data.tags || "").split(",").map((tag) => tag.trim());
  return {
    id: product.id, variantId: product.variantId, key: product.id + ":" + product.variantId,
    title: String(data.title || product.title || "").slice(0, 500), variantTitle: String(variant.title || ""),
    url: productUrl.pathname + productUrl.search, image: safeImage(variant.featured_image?.src || data.featured_image || data.images?.[0]),
    price, priceAmount, available: variant.available === true, vendor: String(data.vendor || ""), type: String(data.type || ""),
    sku: String(variant.sku || ""), description: new DOMParser().parseFromString(data.description || "", "text/html").body.textContent.slice(0, 600),
    metafields: {}, matchPercentage: product.matchPercentage, canCompare: !tags.includes("no-comparison"),
  };
}
export async function loadResults(app, append = false) {
  app.resultController?.abort();
  const controller = new AbortController();
  app.resultController = controller;
  const page = append ? (app.resultsPage || 0) + 1 : 0;
  app.resultState = "loading"; app.resultsError = ""; app.renderStep(false);
  const timer = window.setTimeout(() => controller.abort(), 55000);
  try {
    const endpoint = new URL(app.dataset.endpoint, location.origin);
    if (endpoint.origin !== location.origin) throw new Error("Invalid storefront endpoint.");
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal, credentials: "same-origin",
      body: JSON.stringify({ finderId: app.config.id, version: app.config.version, ruleSetId: app.config.ruleSetId, page, country: app.dataset.country,
        answers: app.config.questions.map((question) => ({ questionId: question.id, answerIds: app.answers.get(question.id) })) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load recommendations. Please try again.");
    if (!Array.isArray(data.products) || data.products.length > 20) throw new Error("Invalid recommendations.");
    const products = (await Promise.all(data.products.map((product) => hydrate(app, product, controller.signal)))).filter(Boolean);
    if (data.products.length && !products.length) throw new Error("These products are no longer available. Please try again.");
    if (controller !== app.resultController || !app.isConnected || !app.complete) return;
    const previous = append && app.results ? app.results.products : [];
    app.resultsPage = page;
    const combinedProducts = [...previous, ...products];
    const popularProducts = combinedProducts.length ? [] : await loadPopularProducts(app, controller.signal);
    if (controller !== app.resultController || !app.isConnected || !app.complete) return;
    app.results = { heading: typeof data.heading === "string" ? data.heading : "Recommended for you", products: combinedProducts, popularProducts, totalCount: Number.isInteger(data.totalCount) && data.totalCount >= 0 ? data.totalCount : null, hasMore: data.hasMore === true };
    app.resultState = "ready";
  } catch (error) {
    if (controller !== app.resultController || !app.isConnected || !app.complete) return;
    app.resultState = "error";
    app.resultsError = controller.signal.aborted ? "Recommendations took too long. Please try again." : error.message;
  } finally {
    window.clearTimeout(timer);
    if (controller === app.resultController && app.isConnected && app.complete) app.renderStep(true);
  }
}
export async function compareProducts(app, products, open = false) {
  if (app.comparing) return;
  app.comparing = true; app.compareError = "";
  app.renderStep(false);
  try {
    const compare = document.querySelector("product-compare-app");
    if (!compare?.initialized || typeof compare.toggle !== "function" || !compare.dialog) throw new Error("Comparison is unavailable. Please refresh and try again.");
    await compare.ensureApi();
    if (!app.isConnected || !app.complete) return;
    if (!compare.sharedView) { compare.items = compare.readSavedList(); compare.sync(); }
    for (const product of products.filter((item) => item.canCompare)) {
      // Use the original persistence/events path, but never toggle an already-selected variant off.
      const selected = compare.sharedView ? compare.items : compare.readSavedList();
      if (!selected.some((item) => item.key === product.key)) compare.toggle(product);
      if (!compare.items.some((item) => item.key === product.key)) throw new Error("Could not add products to comparison. Check your site storage and try again.");
    }
    if (open && products.some((item) => item.canCompare)) {
      if (app.dialog.open) await new Promise((resolve) => {
        app.dialog.addEventListener("close", resolve, { once: true });
        app.dialog.close();
      });
      if (compare.isConnected) compare.openComparison();
    }
  } catch (error) {
    app.compareError = error.message || "Comparison is unavailable. Please try again.";
  } finally {
    app.comparing = false;
    if (app.isConnected && app.complete) app.renderStep(false);
  }
}
async function addToCart(app, product, button) {
  button.disabled = true; button.textContent = "Adding…";
  try {
    const root = app.dataset.routesRoot || "/";
    const endpoint = new URL((root.endsWith("/") ? root : root + "/") + "cart/add.js", location.origin);
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify({ items: [{ id: Number(product.variantId), quantity: 1 }] }) });
    if (!response.ok) throw new Error("Could not add this product to cart.");
    button.textContent = "Added to cart";
    document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
  } catch (error) { button.disabled = false; button.textContent = "Add to cart"; app.resultsError = error.message; app.renderStep(false); }
}
export function renderResults(app) {
  const area = app.querySelector("[data-finder-step]");
  area.replaceChildren();
  if (app.resultState === "loading") {
    const message = element("p", "Finding your matches…");
    message.setAttribute("role", "status"); message.tabIndex = -1;
    area.append(message); return;
  }
  if (app.resultState === "error") {
    const message = element("p", app.resultsError || "Recommendations are unavailable.");
    message.setAttribute("role", "alert"); message.tabIndex = -1;
    const retry = element("button", "Try again", "pf-secondary");
    retry.type = "button"; retry.addEventListener("click", () => void loadResults(app));
    area.append(message, retry); return;
  }
  if (!app.results) return;
  if (!app.results.products.length) { renderNoMatch(app, area); return; }
  if (Number.isInteger(app.results.totalCount)) area.append(element("p", app.results.totalCount + (app.results.totalCount === 1 ? " matching product" : " matching products"), "pf-result-count"));
  if (app.compareError) {
    const error = element("p", app.compareError);
    error.setAttribute("role", "alert"); area.append(error);
  }
  const list = element("div", undefined, "pf-results");
  const compare = document.querySelector("product-compare-app");
  const comparisonActive = Boolean(compare?.initialized && typeof compare.toggle === "function");
  const selected = compare?.sharedView ? compare.items : compare?.readSavedList?.() || [];
  for (const product of app.results.products) {
    const card = element("article", undefined, "pf-result");
    const link = element("a", undefined, "pf-product-link");
    link.href = product.url;
    link.dataset.compareRecommendation = "";
    link.dataset.productId = product.id; link.dataset.variantId = product.variantId;
    if (product.image) {
      const image = element("img");
      image.src = product.image; image.alt = ""; image.loading = "lazy"; image.width = 180; image.height = 180;
      link.append(image);
    }
    link.append(element("h4", product.title));
    card.append(link);
    if (product.variantTitle && product.variantTitle !== "Default Title") card.append(element("p", product.variantTitle, "pf-variant"));
    card.append(element("p", product.price, "pf-price"));
    if (!product.available) card.append(element("p", "Sold out", "pf-variant"));
    const actions = element("div", undefined, "pf-result-actions");
    const added = selected.some((item) => item.key === product.key);
    if (product.available) { const cart = element("button", "Add to cart", "pf-primary"); cart.type = "button"; cart.addEventListener("click", () => void addToCart(app, product, cart)); actions.append(cart); }
    if (comparisonActive && product.canCompare) {
      const button = element("button", added ? "Added to compare" : "Add to compare", "pf-primary pf-compare-action");
      button.type = "button"; button.disabled = app.comparing || added;
      button.dataset.compareDesign = compare.dataset.launcherDesign || "filled";
      const compareStyle = getComputedStyle(compare);
      for (const property of ["--compare-background", "--compare-text", "--compare-border", "--compare-radius", "--compare-font-size", "--compare-font-weight"]) button.style.setProperty(property, compareStyle.getPropertyValue(property));
      button.addEventListener("click", () => void compareProducts(app, [product]));
      actions.append(button);
    }
    card.append(actions); list.append(card);
  }
  area.append(list);

  if (app.results.hasMore) { const more = element("button", "Load more", "pf-secondary pf-load-more"); more.type = "button"; more.addEventListener("click", () => void loadResults(app, true)); area.append(more); }
}