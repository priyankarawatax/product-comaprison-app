(() => {
  const LIMIT = 300;
  const PAGE_SIZE = 16;
  let state, endpoint, request, key, toggle, cartVariantIds, cartVariantIdsPromise, currentPage = 1;
  const loadCartVariantIds = () => {
    if (cartVariantIds) return Promise.resolve(cartVariantIds);
    if (!cartVariantIdsPromise) cartVariantIdsPromise = (async () => {
      const ids = new Set();
      try {
        const root = state.root.dataset.shopRoot || window.Shopify?.routes?.root || "/";
        const response = await fetch(`${root}cart.js`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
        if (response.ok) {
          const cart = await response.json();
          for (const item of cart.items || []) ids.add(String(item.variant_id));
        }
      } catch {}
      cartVariantIds = ids;
      return ids;
    })();
    return cartVariantIdsPromise;
  };
  const formatPrice = (amount, currencyCode) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "";
    const shopify = window.Shopify;
    const moneyFormat = shopify?.money_format || shopify?.money_with_currency_format;
    if (typeof shopify?.formatMoney === "function" && moneyFormat) return shopify.formatMoney(Math.round(value * 100), moneyFormat);
    const currency = shopify?.currency?.active || currencyCode;
    try { return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "currency", currency }).format(value); }
    catch { return `${value.toFixed(2)} ${currencyCode || ""}`.trim(); }
  };
  const loadProducts = async (ids) => {
    const url = new URL(endpoint(state.root, "settings"), location.href);
    url.pathname = url.pathname.replace(/settings\/?$/, "products");
    url.searchParams.set("ids", ids.join(","));
    const result = await request(url.href);
    return result.products || [];
  };
  const renderPage = async () => {
    const page = document.querySelector("[data-pickwise-wishlist-page]");
    if (!page || !state.settings?.enabled) return;
    const mount = page.querySelector(".pickwise-wishlist-page-mount"); if (!mount) return;
    const settings = state.settings.page; mount.style.setProperty("--pwl-page-text", settings.textColor);
    if (!state.items.size) { const empty = document.createElement("div"); empty.className = "pickwise-wishlist-empty"; const message = document.createElement("p"); message.textContent = state.settings.text.emptyWishlist; empty.append(message); if (settings.showContinueShopping) { const go = document.createElement("a"); go.className = "pickwise-wishlist-button"; go.href = state.root.dataset.pageUrl || "/collections/all"; go.textContent = state.settings.text.continueShopping; empty.append(go); } mount.replaceChildren(empty); return; }
    const allIds = [...state.items.keys()].slice(0, LIMIT);
    const pageCount = Math.max(1, Math.ceil(allIds.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount);
    const pageIds = allIds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const cacheKey = pageIds.join(",");
    if (!state.productPageCache) state.productPageCache = new Map();
    if (!state.productPageCache.has(cacheKey)) { try { state.productPageCache.set(cacheKey, await loadProducts(pageIds)); } catch { const message = document.createElement("p"); message.textContent = "Wishlist could not be loaded."; const retry = document.createElement("button"); retry.type = "button"; retry.className = "pickwise-wishlist-button"; retry.textContent = "Retry"; retry.addEventListener("click", () => { state.productPageCache.delete(cacheKey); renderPage(); }); mount.replaceChildren(message, retry); return; } }
    state.products = state.productPageCache.get(cacheKey);
    await loadCartVariantIds();
    const title = document.createElement("h1"); title.textContent = settings.title || state.settings.text.myWishlist;
    const grid = document.createElement("div"); grid.className = settings.layout === "list" ? "pickwise-wishlist-grid pickwise-wishlist-list" : "pickwise-wishlist-grid"; grid.style.setProperty("--pwl-columns", String(settings.productsPerRow));
    const pageProducts = [...state.products, ...pageIds.filter((id) => !state.products.some((product) => key(product.id) === key(id))).map((id) => ({ id, title: "Unavailable product", unavailable: true }))];
    pageProducts.forEach((product) => { const card = document.createElement("article"); card.className = "pickwise-wishlist-card"; if (!product.unavailable && settings.showImage && product.image) { const img = document.createElement("img"); img.src = product.image; img.alt = product.imageAlt || product.title; img.loading = "lazy"; card.append(img); } const link = document.createElement("a"); link.href = product.url || "#"; link.textContent = product.title; if (settings.showTitle) card.append(link); if (!product.unavailable && settings.showPrice) { const price = document.createElement("p"); price.textContent = product.price ? formatPrice(product.price.split(" ")[0], product.currencyCode) : ""; card.append(price); if (product.compareAtPrice) { const compare = document.createElement("s"); compare.textContent = formatPrice(product.compareAtPrice, product.currencyCode); card.append(compare); } } if (settings.showAvailability) { const available = document.createElement("p"); available.textContent = product.available ? "In stock" : state.settings.text.outOfStock; card.append(available); }
      const saved = state.items.get(key(product.id)); let selectedVariant = saved?.variantId || product.variantId;
      if (product.variants?.length > 1 && !saved?.variantId) { const select = document.createElement("select"); select.setAttribute("aria-label", `Choose ${product.title} variant`); product.variants.forEach((variant) => { const option = document.createElement("option"); option.value = variant.id; option.textContent = `${variant.title}${variant.available ? "" : ` — ${state.settings.text.outOfStock}`}`; option.disabled = !variant.available; select.append(option); }); select.addEventListener("change", () => { selectedVariant = select.value; const cart = card.querySelector("[data-wishlist-cart]"); const variant = product.variants.find((item) => item.id === selectedVariant); const added = cartVariantIds.has(String(selectedVariant)); if (cart) { cart.textContent = added ? "Added to cart" : state.settings.text.addToCart; cart.disabled = added || !variant?.available; } }); card.append(select); }
      if (settings.showRemove) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "pickwise-wishlist-button"; remove.textContent = state.settings.text.removeFromWishlist; remove.addEventListener("click", () => toggle({ dataset: { productId: product.id, variantId: selectedVariant } })); card.append(remove); }
      if (!product.unavailable && settings.showAddToCart && product.variants?.length) { const cart = document.createElement("button"); cart.type = "button"; cart.className = "pickwise-wishlist-button"; cart.dataset.wishlistCart = ""; cart.textContent = cartVariantIds.has(String(selectedVariant)) ? "Added to cart" : state.settings.text.addToCart; cart.disabled = !selectedVariant || !product.variants.some((v) => v.id === selectedVariant && v.available) || cartVariantIds.has(String(selectedVariant)); cart.setAttribute("aria-live", "polite"); cart.addEventListener("click", async () => { cart.disabled = true; cart.textContent = "Adding…"; card.querySelector(".pickwise-wishlist-status")?.remove(); try { const root = state.root.dataset.shopRoot || window.Shopify?.routes?.root || "/"; const res = await fetch(`${root}cart/add.js`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items: [{ id: selectedVariant, quantity: 1 }] }) }); if (!res.ok) throw new Error(); cartVariantIds.add(String(selectedVariant)); cart.textContent = "Added to cart"; document.dispatchEvent(new CustomEvent("pickwise-wishlist:cart-added", { detail: { variantId: selectedVariant } })); } catch { const status = document.createElement("p"); status.className = "pickwise-wishlist-status"; status.setAttribute("role", "alert"); status.textContent = "Could not add this item to cart. Please try again."; card.append(status); cart.textContent = state.settings.text.addToCart; } finally { cart.disabled = cartVariantIds.has(String(selectedVariant)); } }); card.append(cart); } grid.append(card); });
    mount.replaceChildren(title); if (settings.description && settings.description !== "Your favorite products, saved for later.") { const description = document.createElement("p"); description.textContent = settings.description; mount.append(description); } mount.append(grid);
    if (pageCount > 1) {
      mount.append(window.PickwiseWishlistPagination(currentPage, pageCount, (page) => { currentPage = page; renderPage(); }));
    }
  };
  const receive = (event) => { ({ state, endpoint, request, key, toggle } = event.detail); void renderPage(); };
  document.addEventListener('pickwise-wishlist:runtime-ready', receive);
  document.addEventListener('pickwise-wishlist:refresh', () => { if (!state) return; if (state.productPageCache) state.productPageCache.clear(); void renderPage(); });
})();
