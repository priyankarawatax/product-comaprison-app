  function cleanImage(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.origin);
      return url.protocol === "https:" &&
        (url.origin === location.origin || url.hostname === "cdn.shopify.com")
        ? url.href : "";
    } catch { return ""; }
  }

function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
async function loadSoldCounts() {
      if (!this.dataset.soldEndpoint) return;
      this.soldCounts ||= new Map();
      const ids = [...new Set(this.items.map((item) => item.id))].sort();
      const cacheKey = ids.join(",");
      if (!ids.length || this.soldCountsLoadedFor === cacheKey) return;
      const url = new URL(this.dataset.soldEndpoint, location.origin);
      url.searchParams.set("ids", cacheKey);
      const response = await fetch(url, { signal: this.events.signal });
      if (!response.ok) throw new Error("Sold counts unavailable");
      const data = await response.json();
      for (const id of ids) {
        const count = data.sold?.[id];
        if (Number.isSafeInteger(count) && count >= 0) this.soldCounts.set(id, count);
      }
      this.soldCountsLoadedFor = cacheKey;
    }
export async function loadDetails() {
      if (this.dataset.metafieldModule && ((this.dataset.metafieldRows && this.dataset.metafieldRows !== "null" && this.dataset.metafieldRows !== "[]") || (this.dataset.reviewSettings && this.dataset.reviewSettings !== "null"))) {
        void import(this.dataset.metafieldModule).then((module) => module.loadMetafields.call(this)).catch(() => {});
      }
      const soldCounts = loadSoldCounts.call(this).catch(() => {});
      await Promise.all(this.items.map(async (item) => {
        if (this.details.has(item.key)) return;
        this.details.set(item.key, { loading: true });
        try {
          const url = new URL(item.url, location.origin);
          const root = (this.dataset.routesRoot || "/").replace(/\/?$/, "/");
          const handle = url.pathname.split("/products/")[1].replace(/\/$/, "");
          const response = await fetch(root + "products/" + handle + ".js", { signal: this.events.signal });
          if (!response.ok) throw new Error("Product unavailable");
          const data = await response.json();
          if (String(data.id) !== item.id) throw new Error("Product mismatch");
          const variants = data.variants.filter((variant) => /^\d+$/.test(String(variant.id)));
          const requested = item.variantId || url.searchParams.get("variant");
          const variant = requested ? variants.find((entry) => String(entry.id) === requested) : variants.find((entry) => entry.available) || variants[0];
          if (!variant) throw new Error("Variant unavailable");
          const key = item.id + ":" + variant.id;
          this.details.set(key, { variants: [variant], selected: String(variant.id) });
          const image = cleanImage(variant.featured_image?.src || data.featured_image || data.images?.[0]);
          url.searchParams.set("variant", String(variant.id));
          const description = new DOMParser().parseFromString(data.description || "", "text/html").body.textContent.slice(0, 600);
          const update = (entry) => ({ ...entry, key, title: data.title || entry.title, vendor: data.vendor || entry.vendor, type: data.type || entry.type, description: description || entry.description, variantId: String(variant.id), variantTitle: variant.title,
            image: image || entry.image, sku: variant.sku || "", available: variant.available,
            url: url.pathname + url.search,
            priceAmount: variant.price,
            price: this.dataset.currency ? new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: this.dataset.currency }).format(variant.price / 100) : entry.price,
          });
          this.items = this.items.map((entry) => entry.key === item.key ? update(entry) : entry);
          try {
            const saved = this.readSavedList().map((entry) => entry.key === item.key ? update(entry) : entry);
            if (!this.sharedView) localStorage.setItem("product-compare:list:v1", JSON.stringify(saved));
          } catch { /* Images still display when storage is unavailable. */ }
        } catch (error) {
          if (error.name === "AbortError") return;
          this.details.set(item.key, { error: true });
        }
      }));
      await soldCounts;
      if (this.isConnected && this.dialog.open) this.renderList();
    }
export async function addToCart(item, button) {
      const detail = this.details.get(item.key);
      if (!detail?.selected || this.cartPending.has(item.key) || this.cartAdded.has(item.key)) return;
      this.track("comparison_add_to_cart", { productId: item.id, variantId: detail.selected });
      this.cartPending.add(item.key);
      button.disabled = true;
      button.textContent = "Adding...";
      const status = this.dialog.querySelector("[data-compare-cart-status]");
      status.textContent = "";
      try {
        const root = (this.dataset.routesRoot || "/").replace(/\/?$/, "/");
        const response = await fetch(root + "cart/add.js", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ id: detail.selected, quantity: 1 }] }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.description || "Unable to add product to cart.");
        this.cartAdded.add(item.key);
        document.dispatchEvent(new CustomEvent("product-compare:cart-added", { detail: result }));
      } catch (error) {
        status.textContent = error.message || "Unable to add product. Please try again.";
      } finally {
        this.cartPending.delete(item.key);
        if (this.isConnected && this.dialog.open) this.renderList();
      }
    }

export function appendCartControls(item, card) {
          const detail = this.details.get(item.key);
          const available = detail?.variants?.some((variant) => variant.available);
          const label = this.cartAdded.has(item.key) ? "Added to cart" : this.cartPending.has(item.key) ? "Adding..." : detail?.error ? "Retry loading product" : !detail?.variants || available ? "Add to cart" : "Sold out";
          const action = element("button", label, "product-compare-view");
          action.type = "button";
          action.disabled = this.cartAdded.has(item.key) || this.cartPending.has(item.key) || (!detail?.error && !available);
          action.addEventListener("click", () => {
            if (detail?.error) { this.details.delete(item.key); void this.loadDetails(); }
            else void this.addToCart(item, action);
          });
          card.append(action);

}

export function renderList() {
      if (this.dataset.smartBadgesModule) {
        const load = this.badgesApi ? Promise.resolve(this.badgesApi) : import(this.dataset.smartBadgesModule).then((module) => (this.badgesApi = module));
        void load.then((module) => module.refreshComparisonBadges(this)).catch(() => {});
      }
      this.columnEvents?.abort();
      this.columnEvents = new AbortController();
      const signal = this.columnEvents.signal;
      const price = (item) => typeof item.priceAmount === "number" && Number.isFinite(item.priceAmount) ? item.priceAmount : Infinity;
      const items = [...this.items].sort((a, b) => price(a) - price(b));
      if (this.columnOrder) {
        const positions = new Map(this.columnOrder.map((key, index) => [key, index]));
        items.sort((a, b) => (positions.get(a.key) ?? Infinity) - (positions.get(b.key) ?? Infinity));
      }
      const focusedColumn = document.activeElement?.dataset?.columnFocus;
      const reorder = (source, target) => {
        const keys = items.map((item) => item.key);
        const from = keys.indexOf(source), to = keys.indexOf(target);
        if (from < 0 || to < 0 || from === to) return;
        keys.splice(to, 0, keys.splice(from, 1)[0]);
        this.columnOrder = keys;
        this.renderList();
        [...this.tableArea.querySelectorAll('[data-column-focus]')].find((node) => node.dataset.columnFocus === source)?.focus({ preventScroll: true });
      };
      // Retain keyboard focus when a remove button is replaced during render.
      const focusedId = document.activeElement?.dataset?.removeId;
      const focusedIndex = focusedId
        ? items.findIndex((item) => item.key === focusedId)
        : -1;
      const scrollLeft = this.tableArea.scrollLeft;
      const focusedHighlight = [this.similarities, this.differences].find((input) => input === document.activeElement);
      this.highlightControls ||= this.similarities.closest(".product-compare-toolbar");
      this.tableArea.replaceChildren();
      this.dialog.querySelector("[data-compare-summary]").textContent = `${this.items.length} variants selected`;
      this.similarities.disabled = this.differences.disabled = this.items.length < 2;
      const note = this.dialog.querySelector(".product-compare-note");
      if (note) note.hidden = !this.items.length;
      if (!this.items.length) {
        this.tableArea.before(this.highlightControls);
        this.tableArea.append(
          element(
            "p",
            "Your comparison list is empty. Add products using the comparison control on a product page.",
          ),
        );
      } else {
        const table = element("table", undefined, "product-compare-table pc-table");
        table.style.setProperty("--compare-columns", this.items.length);
        const caption = element("caption", "Selected products");
        const head = element("thead");
        const names = element("tr");
        const corner = element("th", undefined, "product-compare-highlight-cell");
        corner.scope = "col";
        corner.append(this.highlightControls);
        names.append(corner);
        const bindColumnDrag = (cell, item) => {
          cell.dataset.columnKey = item.key;
          cell.addEventListener("keydown", (event) => {
            if (event.target !== cell) return;
            if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            const target = items[items.indexOf(item) + (event.key === "ArrowLeft" ? -1 : 1)];
            if (target) reorder(item.key, target.key);
          });
          cell.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || event.isPrimary === false) return;
            const dragEvents = new AbortController();
            const cleanup = () => {
              dragEvents.abort();
              signal.removeEventListener("abort", cleanup);
              if (cell.hasPointerCapture?.(event.pointerId)) cell.releasePointerCapture(event.pointerId);
              for (const node of table.querySelectorAll('[data-column-key]')) node.classList.remove("product-compare-drop-target");
            };
            signal.addEventListener("abort", cleanup, { once: true });
            let target = item.key;
            let dragging = false;
            const move = (next) => {
              if (next.pointerId !== event.pointerId) return;
              if (!dragging) {
                const dx = Math.abs(next.clientX - event.clientX);
                const dy = Math.abs(next.clientY - event.clientY);
                if (dx < 8 || dx < dy) return;
                dragging = true;
                cell.setPointerCapture?.(event.pointerId);
              }
              next.preventDefault();
              const area = this.tableArea.getBoundingClientRect();
              if (next.clientX > area.right - 40) this.tableArea.scrollLeft += 30;
              else if (next.clientX < area.left + 40) this.tableArea.scrollLeft -= 30;
              for (const node of names.children) {
                const rect = node.getBoundingClientRect();
                if (node.dataset.columnKey && next.clientX >= rect.left && next.clientX <= rect.right) target = node.dataset.columnKey;
              }
              for (const node of table.querySelectorAll('[data-column-key]')) node.classList.toggle("product-compare-drop-target", node.dataset.columnKey === target && target !== item.key);
            };
            document.addEventListener("pointermove", move, { passive: false, signal: dragEvents.signal });
            document.addEventListener("pointerup", (next) => {
              if (next.pointerId !== event.pointerId) return;
              cleanup();
              if (!dragging) return;
              // Consume only the click generated by a drag; ordinary links and buttons still work.
              const suppressClick = (click) => { click.preventDefault(); click.stopImmediatePropagation(); };
              document.addEventListener("click", suppressClick, { capture: true, once: true });
              window.setTimeout(() => document.removeEventListener("click", suppressClick, true), 0);
              reorder(item.key, target);
            }, { signal: dragEvents.signal });
            document.addEventListener("pointercancel", cleanup, { signal: dragEvents.signal });
            document.addEventListener("keydown", (next) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } }, { signal: dragEvents.signal });
            window.addEventListener("blur", cleanup, { signal: dragEvents.signal });
          });
        };
        table.addEventListener("dragstart", (event) => event.preventDefault());
        for (const item of items) {
          const cell = element("th");
          cell.scope = "col";
          cell.tabIndex = 0;
          cell.dataset.columnFocus = item.key;
          cell.setAttribute("aria-label", `${item.title}. Drag to move column or use left and right arrow keys.`);
          bindColumnDrag(cell, item);
          const link = element("a", item.title);
          link.href = item.url;
          const card = element("div", undefined, "product-compare-card pc-product-card");
          const dragHint = element("span", "⠿", "product-compare-drag-hint");
          dragHint.setAttribute("aria-hidden", "true");
          dragHint.title = "Drag to reorder";
          const remove = element("button", "\u00d7", "product-compare-remove");
          remove.type = "button";
          remove.dataset.removeId = item.key;
          remove.setAttribute("aria-label", `Remove ${item.title} from comparison`);
          remove.addEventListener("click", () => this.toggle(item), { once: true });
          const media = element("a", undefined, "product-compare-media pc-product-image");
          media.href = item.url;
          media.setAttribute("aria-label", item.title);
          if (item.image) {
            const image = element("img");
            image.src = item.image;
            image.alt = item.title;
            image.width = 300;
            image.height = 200;
            image.loading = "lazy";
            media.append(image);
          } else media.append(element("span", "No image available"));
          link.className = "product-compare-title pc-product-title";
          card.append(dragHint, remove, media, link);
          if (this.api) this.api.appendCartControls.call(this, item, card);
          else {
            const loading = element("button", "Load product", "product-compare-view");
            loading.type = "button";
            loading.addEventListener("click", () => void this.loadDetails());
            card.append(loading);
          }
          cell.append(card);
          names.append(cell);
        }
        head.append(names);
        const body = element("tbody");
        if (this.smartBadgesEnabled && items.length >= 2) {
          const badgeRow = element("tr");
          badgeRow.dataset.field = "smartBadges";
          const badgeHeading = element("th", "Smart Badges");
          badgeHeading.scope = "row";
          badgeRow.append(badgeHeading);
          for (const item of items) {
            const badgeCell = element("td");
            bindColumnDrag(badgeCell, item);
            const badges = this.badgeAssignments?.[item.key] || [];
            const badgeList = element("div", undefined, "product-compare-badges");
            badgeList.setAttribute("role", "list");
            badgeList.setAttribute("aria-label", `Highlights for ${item.title}`);
            for (const badge of badges) {
              const label = this.badgeLabels?.[badge] || this.badgesApi?.BADGE_LABELS?.[badge];
              if (!label) continue;
              const pill = element("span", label, `product-compare-badge pc-badge product-compare-badge--${badge.replaceAll("_", "-")}`);
              pill.setAttribute("role", "listitem");
              badgeList.append(pill);
            }
            if (badgeList.children.length) badgeCell.append(badgeList);
            else badgeCell.textContent = "—";
            badgeRow.append(badgeCell);
          }
          body.append(badgeRow);
        }
        const rows = [
          ["Variant", "variantTitle"],
          ["Price", "price"],
          ["Vendor", "vendor"],
          ["Product type", "type"],
          ["Availability", "available"],
          ["SKU", "sku"],
          ["Customer rating", "rating"],
          ["Reviews", "reviewCount"],
          ["Total sold", "soldCount"],
          ["Description", "description"],
        ];
        try {
          const custom = JSON.parse(this.dataset.metafieldRows || "[]");
          if (Array.isArray(custom)) for (const field of custom.slice(0, 20)) {
            if (typeof field.label === "string" && /^metafield:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(field.id)) rows.push([field.label, field.id]);
          }
        } catch { /* No configured custom rows. */ }
        let rowLabels = {};
        try { const saved = JSON.parse(this.dataset.rowLabels || "{}"); if (saved && typeof saved === "object" && !Array.isArray(saved)) rowLabels = saved; } catch { /* Default labels. */ }
        const valueFor = (item, field) => {
          if (field === "soldCount") return this.soldCounts?.get(item.id);
          if (field === "rating") {
            if (!Number.isFinite(item.rating)) return "";
            const rating = Math.max(0, Math.min(5, item.rating));
            const stars = Math.round(rating);
            return `${"★".repeat(stars)}${"☆".repeat(5 - stars)} ${rating.toFixed(1)}/5`;
          }
          if (field.startsWith("metafield:")) return item.metafields?.[field] || "";
          return item[field];
        };
        let order = [];
        try { const saved = JSON.parse(this.dataset.rowOrder || "null"); if (Array.isArray(saved)) order = saved; } catch { /* Default order. */ }
        const fields = [...new Set([...order, ...rows.map(([, field]) => field)])].filter((field) => field !== "description");
        fields.push("description");
        const prices = items.map((item) => item.priceAmount).filter((price) => Number.isFinite(price));
        const lowestPrice = prices.length ? Math.min(...prices) : null;
        let disabled = [];
        try { const saved = JSON.parse(this.dataset.disabledRows || "null"); if (Array.isArray(saved)) disabled = saved; } catch { /* All rows enabled by default. */ }
        for (const field of fields) {
          if (disabled.includes(field)) continue;
          const rowConfig = rows.find(([, id]) => id === field);
          if (!rowConfig) continue;
          const [defaultLabel] = rowConfig;
          const customLabel = rowLabels[field];
          const label = typeof customLabel === "string" && customLabel.trim() && customLabel.trim().length <= 40 ? customLabel.trim() : defaultLabel;
          const same = this.items.every((item) => valueFor(item, field) === valueFor(this.items[0], field));
          const highlight = this.items.length > 1 && (same ? this.similarities.checked : this.differences.checked);
          const row = element("tr", undefined, highlight ? (same ? "product-compare-similar" : "product-compare-different") : undefined);
          const heading = element("th", label);
          heading.classList.add("pc-label-cell");
          row.dataset.field = field;
          heading.scope = "row";
          row.append(heading);
          for (const item of items) {
            const value = valueFor(item, field);
            const cell = element(
                "td",
                field === "available"
                  ? item.available
                    ? "Available"
                    : "Sold out"
                  : field === "variantTitle" && (!item[field] || item[field] === "Default Title")
                    ? "-"
                    : value === 0 ? "0" : value || "\u2014",
              );
            cell.classList.add("pc-cell");
            if (field === "rating" && Number.isFinite(item.rating)) {
              const rating = Math.max(0, Math.min(5, item.rating));
              const stars = Math.round(rating);
              const starText = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
              const starDisplay = element("span", starText, "pc-rating-stars");
              starDisplay.setAttribute("aria-hidden", "true");
              cell.textContent = "";
              cell.setAttribute("aria-label", `${rating.toFixed(1)} out of 5 stars`);
              cell.append(starDisplay, document.createTextNode(` ${rating.toFixed(1)}/5`));
            }
            if (field === "price") {
              cell.classList.add("pc-price");
              if (this.differences.checked && Number.isFinite(item.priceAmount) && lowestPrice !== null) {
                cell.classList.add(item.priceAmount === lowestPrice ? "pc-price-lowest" : "pc-price-higher");
              }
            }
            if (field === "description" && value) {
              cell.textContent = "";
              const parts = String(value).split(/(?:\r?\n|[.!?;]+\s+)/).map((part) => part.trim()).filter(Boolean);
              const list = element("ul", undefined, "product-compare-description-list");
              for (const part of parts.slice(0, 5)) list.append(element("li", part));
              if (list.children.length) cell.append(list);
            }
            bindColumnDrag(cell, item);
            row.append(cell);
          }
          body.append(row);
        }
        table.append(caption, head, body);
        this.tableArea.append(table);
      }
      this.tableArea.scrollLeft = scrollLeft;
      if (focusedHighlight) focusedHighlight.focus({ preventScroll: true });
      if (focusedColumn) [...this.tableArea.querySelectorAll('[data-column-focus]')].find((node) => node.dataset.columnFocus === focusedColumn)?.focus({ preventScroll: true });
      if (focusedId) {
        const buttons = this.tableArea.querySelectorAll("[data-remove-id]");
        (
          buttons[Math.max(0, focusedIndex)] ||
          buttons[buttons.length - 1] ||
          this.dialog.querySelector("button")
        ).focus();
      }
    }
