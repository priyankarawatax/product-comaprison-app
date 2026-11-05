(() => {
  if (customElements.get("product-compare-app")) return;
  const STORAGE_KEY = "product-compare:list:v1";
  function cleanImage(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.origin);
      return url.protocol === "https:" &&
        (url.origin === location.origin || url.hostname === "cdn.shopify.com")
        ? url.href : "";
    } catch { return ""; }
  }
  function cleanProduct(value) {
    if (
      !value ||
      typeof value.id !== "string" ||
      !/^\d+$/.test(value.id) ||
      typeof value.title !== "string"
    )
      return null;
    try {
      const url = new URL(value.url, location.origin);
      if (
        url.origin !== location.origin ||
        !url.pathname.includes("/products/")
      )
        return null;
      const variantId = /^\d+$/.test(String(value.variantId || "")) ? String(value.variantId) : "";
      return {
        id: value.id,
        variantId,
        key: value.id + ":" + variantId,
        variantTitle: String(value.variantTitle || ""),
        title: value.title.slice(0, 500),
        url: url.pathname + url.search,
        price: String(value.price || ""),
        priceAmount: typeof value.priceAmount === "number" && Number.isFinite(value.priceAmount) ? value.priceAmount : null,
        vendor: String(value.vendor || ""),
        type: String(value.type || ""),
        available: value.available === true,
        image: cleanImage(value.image),
        sku: String(value.sku || ""),
        description: String(value.description || "").slice(0, 600),
        // Only configured row IDs are rendered; values remain bounded plain text.
        metafields: Object.fromEntries(Object.entries(value.metafields || {}).filter(([, entry]) => typeof entry === "string").slice(0, 20).map(([key, entry]) => [key, entry.slice(0, 2000)])),
      };
    } catch {
      return null;
    }
  }
  function readList(limit) {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return [
        ...new Map(
          parsed
            .map(cleanProduct)
            .filter(Boolean)
            .map((item) => [item.key, item]),
        ).values(),
      ].slice(0, limit);
    } catch {
      return [];
    }
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  class ProductCompare extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      this.events = new AbortController();
      const signal = this.events.signal;
      this.selectionLimit = Math.min(10, Math.max(2, parseInt(this.dataset.comparisonLimit) || 2));
      this.items = readList(this.selectionLimit);
      this.sharedView = false;
      this.details = new Map();
      this.cartPending = new Set();
      this.cartAdded = new Set();
      this.controls = new Map();
      try {
        const data = JSON.parse(this.dataset.product || "null");
        this.product = cleanProduct(data);
        this.variantIds = new Set((data?.variantIds || []).map(String));
        this.variants = data?.variants || [];
      } catch {
        this.product = null;
      }
      this.excluded = this.dataset.excluded === "true";
      this.launcher = element("button", "", "button product-compare-launcher");
      this.launcher.type = "button";
      this.launcher.dataset.position = this.dataset.position || "bottom_right";
      this.launcher.setAttribute("aria-haspopup", "dialog");
      this.launcher.hidden = true;
      this.toast = element("div", "", "product-compare-toast");
      this.toast.setAttribute("role", "status");
      this.toast.setAttribute("aria-live", "polite");
      this.toast.hidden = true;
      this.modalTemplate ||= this.querySelector("template[data-compare-modal]");
      if (!this.modalTemplate) return;
      this.dialog = this.modalTemplate.content.querySelector("dialog").cloneNode(true);
      const dialog = this.dialog;
      this.tableArea = dialog.querySelector(".product-compare-table-area");
      this.similarities = dialog.querySelector("[data-compare-similarities]");
      this.differences = dialog.querySelector("[data-compare-differences]");
      for (const input of [this.similarities, this.differences]) input.addEventListener("change", () => this.renderList(), { signal });
      document.addEventListener("change", () => {
        for (const control of this.controls.values()) this.updateControl(control);
      }, { signal });
      dialog.querySelector("[data-compare-close]").addEventListener("click", () => dialog.close(), {
        signal,
      });
      this.replaceChildren(this.launcher, this.toast, dialog);
      dialog.querySelector("[data-compare-copy]").addEventListener("click", () => void this.shareAction("copyLink"), { signal });
      dialog.querySelector("[data-compare-remove-all]").addEventListener("click", () => void this.shareAction("removeAll"), { signal });
      this.launcher.addEventListener(
        "click",
        () => this.openComparison(),
        { signal },
      );
      dialog.addEventListener("close", () => {
        document.documentElement.style.overflow = this.previousOverflow ?? "";
        this.launcher.focus();
      }, {
        signal,
      });
      dialog.addEventListener(
        "click",
        (event) => {
          if (event.target === dialog) dialog.close();
        },
        { signal },
      );
      window.addEventListener(
        "storage",
        (event) => {
          if (!this.sharedView && (event.key === STORAGE_KEY || event.key === null)) {
            this.items = readList(this.selectionLimit);
            this.sync();
          }
        },
        { signal },
      );
      if (this.dataset.hideOnScroll === "true") {
        window.addEventListener(
          "scroll",
          () => {
            if (document.activeElement === this.launcher) return;
            this.launcher.hidden = true;
            window.clearTimeout(this.scrollTimer);
            this.scrollTimer = window.setTimeout(() => {
              this.launcher.hidden = this.excluded || !this.items.length;
            }, 200);
          },
          { passive: true, signal },
        );
      }
      this.observer = new MutationObserver(() => {
        // Only child-list changes are observed, and our own UI is ignored.
        if (this.mountTimer) return;
        this.mountTimer = window.setTimeout(() => {
              this.mountControls();
        }, 80);
      });
      this.observer.observe(document.querySelector("main") || document.body, {
        childList: true,
        subtree: true,
      });
      this.mountControls();
      this.sync();
      if (this.dataset.apiModule) void this.ensureApi().catch(() => {});
      if (location.hash.startsWith("#compare=")) void this.shareAction("openShared");
    }
    openComparison() {
      if (!this.api) {
        void this.ensureApi().then(() => {
          if (this.isConnected) this.openComparison();
        }).catch(() => this.notify("Try again."));
        return;
      }
      this.renderList();
      if (!this.dialog.open) {
        this.dialog.showModal();
        this.track("comparison_opened");
        this.previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
      }
      void this.loadDetails();
    }
    async shareAction(action) {
      try {
        this.shareApi ||= await import(this.dataset.shareModule);
        await this.shareApi[action](this);
      } catch {
        this.openComparison();
        this.dialog.querySelector("[data-compare-share-status]").textContent = "Link error.";
      }
    }
    disconnectedCallback() {
      this.columnEvents?.abort();
      this.events?.abort();
      this.observer?.disconnect();
      window.clearTimeout(this.scrollTimer);
      window.clearTimeout(this.toastTimer);
      window.clearTimeout(this.mountTimer);
      for (const control of this.controls?.values() || [])
        control.wrapper.remove();
      if (this.dialog?.open) {
        this.dialog.close();
        document.documentElement.style.overflow = this.previousOverflow ?? "";
      }
      this.initialized = false;
    }
    notify(message) {
      window.clearTimeout(this.toastTimer);
      this.toast.textContent = message;
      this.toast.hidden = false;
      this.toastTimer = window.setTimeout(() => {
        this.toast.hidden = true;
      }, 3500);
    }
    track(eventType, data) {
      this.dispatchEvent(new CustomEvent("product-compare:analytics", { bubbles: true, detail: { eventType, ...data } }));
    }
    toggle(product) {
      // Read again before writing so actions in another tab are respected.
      if (!this.sharedView) this.items = readList(this.selectionLimit);
      const removing = this.items.some((item) => item.key === product.key);
      const replaced = !removing && this.items.length >= this.selectionLimit
        ? this.items[0]
        : null;
      const next = removing
        ? this.items.filter((item) => item.key !== product.key)
        : [...(replaced ? this.items.slice(1) : this.items), product];
      try {
        if (!this.sharedView) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        this.sync();
        this.notify(
          "Storage blocked.",
        );
        return;
      }
      this.items = next;
      if (replaced) this.track("product_compare_removed", replaced);
      this.track(removing ? "product_compare_removed" : "product_compare_added", product);
      if (replaced) this.notify(`${replaced.title} was removed from comparison.`);
      this.sync();
      document.dispatchEvent(
        new CustomEvent("product-compare:change", {
          detail: { productIds: next.map((item) => item.id) },
        }),
      );
      if (removing && !next.length && this.dialog.open) this.dialog.close();
    }
    selection(target) {
      if (!this.product) return null;
      const form = target?.closest('form[action*="/cart/add"]');
      const input = form?.querySelector('[name="id"]') || [...document.querySelectorAll('main form[action*="/cart/add"] [name="id"]')].find((node) => this.variantIds.has(String(node.value)));
      const variantId = String(input?.value || new URL(location.href).searchParams.get("variant") || this.product.variantId);
      const variant = this.variants.find((entry) => entry.variantId === variantId);
      const selected = cleanProduct({ ...this.product, ...variant, variantId });
      const url = new URL(selected.url, location.origin);
      if (selected.variantId) url.searchParams.set("variant", selected.variantId);
      selected.url = url.pathname + url.search;
      return selected;
    }
    createControl(target) {
      const wrapper = element("div", undefined, "product-compare-control");
      const text = element("span", "Add to comparison");
      let input;
      if (this.dataset.display === "checkbox") {
        const label = element("label", undefined, "product-compare-checkbox");
        input = element("input");
        input.type = "checkbox";
        label.append(input, text);
        wrapper.append(label);
        input.addEventListener("change", () => this.toggle(this.selection(target)), {
          signal: this.events.signal,
        });
      } else {
        input = element("button", undefined, "button button--secondary");
        input.type = "button";
        input.append(text);
        wrapper.append(input);
        input.addEventListener("click", () => this.toggle(this.selection(target)), {
          signal: this.events.signal,
        });
      }
      return { wrapper, input, text, target };
    }
    mountControls() {
      const slots = [
        ...document.querySelectorAll("product-comparison-slot"),
      ].filter((slot) => slot.dataset.productId === this.product?.id);
      for (const slot of slots) {
        const hint = slot.querySelector("[data-compare-editor-hint]");
        if (hint) hint.hidden = true;
      }
      if (!this.product || this.excluded) return;
      // A manually placed comparison block wins over automatic insertion.
      const targets = slots.length
        ? slots
        : [...document.querySelectorAll('form[action*="/cart/add"]')]
            .filter((form) => {
              const variant = form.querySelector('[name="id"]');
              const primary = document.querySelector("main");
              return (
                variant &&
                this.variantIds?.has(String(variant.value)) &&
                (!primary || primary.contains(form)) &&
                !form.closest(
                  "quick-add-modal, quick-add-drawer, [data-quick-add]",
                )
              );
            })
            .map((form) =>
              form.querySelector(
                '[name="add"], button[type="submit"], input[type="submit"]',
              ),
            )
            .filter(Boolean);
      const activeTargets = new Set(targets);
      for (const [target, control] of this.controls) {
        if (
          !target.isConnected ||
          !control.wrapper.isConnected ||
          !activeTargets.has(target)
        ) {
          control.wrapper.remove();
          this.controls.delete(target);
        }
      }
      for (const target of targets) {
        if (this.controls.has(target)) { this.updateControl(this.controls.get(target)); continue; }
        const control = this.createControl(target);
        if (slots.includes(target)) target.append(control.wrapper);
        else
          target.insertAdjacentElement(
            this.dataset.placement === "before" ? "beforebegin" : "afterend",
            control.wrapper,
          );
        this.controls.set(target, control);
        this.updateControl(control);
      }
    }
    updateControl(control) {
      const selected = this.items.some((item) => item.key === this.selection(control.target)?.key);
      if (control.input.type === "checkbox") control.input.checked = selected;
      else control.input.setAttribute("aria-pressed", String(selected));
      const label = selected ? "Remove from comparison" : "Add to comparison";
      if (control.text.textContent !== label) control.text.textContent = label;
    }
    sync() {
      this.launcher.hidden = this.excluded || !this.items.length;
      for (const selector of ["[data-compare-copy]", "[data-compare-remove-all]"]) this.dialog.querySelector(selector).disabled = !this.items.length;
      this.launcher.textContent = `${this.dataset.launcherLabel?.trim() || "Compare"} (${this.items.length})`;
      for (const control of this.controls.values()) this.updateControl(control);
      if (this.dialog.open) this.renderList();
    }
    readSavedList() { return readList(this.selectionLimit); }
    async ensureApi() {
      if (this.api) return this.api;
      this.apiPromise ||= import(this.dataset.apiModule).catch((error) => { this.apiPromise = null; throw error; });
      this.api = await this.apiPromise;
      return this.api;
    }
    async loadDetails() {
      try {
        await this.ensureApi();
        await this.api.loadDetails.call(this);
      } catch {
        for (const item of this.items) this.details.set(item.key, { error: true });
        if (this.isConnected && this.dialog.open) this.renderList();
      }
    }
    async addToCart(item, button) {
      if (this.api) await this.api.addToCart.call(this, item, button);
    }
    renderList() {
      if (this.api) this.api.renderList.call(this);
    }

  }
  customElements.define("product-compare-app", ProductCompare);
})();
