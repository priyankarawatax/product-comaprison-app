(() => {
  if (customElements.get("product-finder-app")) return;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  class ProductFinder extends HTMLElement {
    connectedCallback() {
      if (this.controller || document.querySelector("product-finder-app") !== this) return;
      this.controller = new AbortController();
      this.hidden = true;
      this.answers = new Map();
      this.index = 0;
      this.complete = false;
      this.dialog = this.querySelector("dialog");
      this.launcher = this.querySelector("[data-finder-open]");
      if (!this.dialog || !this.launcher || typeof this.dialog.showModal !== "function") return;
      const signal = this.controller.signal;
      this.launcher.addEventListener("click", () => this.open(), { signal });
      this.querySelector("[data-finder-close]").addEventListener("click", () => this.dialog.close(), { signal });
      this.dialog.addEventListener("close", () => this.onClose(), { signal });
      this.dialog.addEventListener("click", (event) => {
        if (event.target !== this.dialog) return;
        const rect = this.dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.dialog.close();
      }, { signal });
      this.querySelector("[data-finder-back]").addEventListener("click", () => {
        if (this.complete) { this.resultController?.abort(); this.complete = false; this.index = this.config.questions.length - 1; }
        else if (this.index > 0) this.index -= 1;
        this.renderStep(true);
      }, { signal });
      this.querySelector("[data-finder-next]").addEventListener("click", () => {
        if (this.complete) {
          this.resultController?.abort(); this.results = null; this.answers.clear(); this.index = 0; this.complete = false;
        } else {
          const question = this.config.questions[this.index];
          if (!(this.answers.get(question.id)?.length)) return;
          if (this.index < this.config.questions.length - 1) this.index += 1;
          else {
            void this.finish(); return;
          }
        }
        this.renderStep(true);
      }, { signal });
      this.addEventListener("change", (event) => {
        if (!event.target.matches('input[name="product-finder-answer"]')) return;
        const question = this.config.questions[this.index];
        if (!question.answers.some((answer) => answer.id === event.target.value)) return;
        const current = this.answers.get(question.id) || [];
        if (question.selectionMode === "multiple") {
          const selected = event.target.checked ? [...new Set([...current, event.target.value])] : current.filter((id) => id !== event.target.value);
          if (selected.length) this.answers.set(question.id, selected); else this.answers.delete(question.id);
        } else this.answers.set(question.id, [event.target.value]);
        this.querySelector("[data-finder-next]").disabled = !(this.answers.get(question.id)?.length);
      }, { signal });
      this.media = window.matchMedia("(max-width: 749px)");
      this.media.addEventListener("change", () => {
        if (!this.deviceEnabled() && this.dialog.open) this.dialog.close();
        this.schedulePosition();
      }, { signal });
      window.addEventListener("resize", () => this.schedulePosition(), { signal });
      void this.load(signal);
    }
    async load(signal) {
      const timeout = window.setTimeout(() => this.controller?.abort(), 10000);
      try {
        const endpoint = new URL(this.dataset.endpoint, window.location.origin);
        if (endpoint.origin !== window.location.origin) return;
        const collectionIds = [...new Set((this.dataset.collectionIds || this.dataset.collectionId || "")
          .split(",").map((id) => id.trim()).filter((id) => /^[1-9][0-9]{0,19}$/.test(id)))].slice(0, 50);
        if (collectionIds.length) endpoint.searchParams.set("collection_ids", collectionIds.join(","));
        if (/^[1-9][0-9]{0,19}$/.test(this.dataset.productId || "")) endpoint.searchParams.set("product_id", this.dataset.productId);
        if (this.dataset.productVendor) endpoint.searchParams.set("vendor", this.dataset.productVendor.slice(0, 255));
        const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal, credentials: "same-origin" });
        if (!response.ok) return;
        const config = await response.json();
        if (!this.isConnected || signal.aborted || !config.enabled
          || typeof config.title !== "string" || typeof config.buttonText !== "string"
          || !["bottom_left", "bottom_right", "bottom_center", "center_left", "center_right", "top_center"].includes(config.buttonPosition)
          || !Array.isArray(config.questions) || !config.questions.length || config.questions.length > 20
          || config.questions.some((q) => typeof q.id !== "string" || typeof q.question !== "string"
            || !Array.isArray(q.answers) || q.answers.length < 2 || q.answers.length > 20
            || q.answers.some((a) => typeof a.id !== "string" || typeof a.label !== "string"))) return;
        this.config = config;
        const appearance = config.appearance && typeof config.appearance === "object" ? config.appearance : {};
        const color = (value, fallback) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
        const size = (value, min, max, fallback) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;
        this.style.setProperty("--pf-luxury-bg", color(appearance.modalBackground, "#FAF9F6"));
        this.style.setProperty("--pf-luxury-ink", color(appearance.modalTextColor, "#202020"));
        this.style.setProperty("--pf-luxury-accent", color(appearance.modalAccentColor, "#B49A82"));
        this.style.setProperty("--pf-luxury-radius", size(appearance.modalBorderRadius, 0, 40, 20) + "px");
        this.style.setProperty("--pf-luxury-title-size", size(appearance.modalTitleSize, 20, 48, 28) + "px");
        this.style.setProperty("--pf-luxury-question-size", size(appearance.modalQuestionSize, 14, 32, 20) + "px");
        this.style.setProperty("--pf-search-bg", color(appearance.buttonBackground, "#FAF9F6"));
        this.style.setProperty("--pf-search-color", color(appearance.buttonTextColor, "#202020"));
        this.style.setProperty("--pf-search-border", color(appearance.buttonBorderColor, "#DDD2C5"));
        this.style.setProperty("--pf-search-font-size", size(appearance.buttonFontSize, 11, 24, 15) + "px");
        this.style.setProperty("--pf-modal-padding", size(appearance.modalPadding, 16, 48, 34) + "px");
        this.style.setProperty("--pf-answer-padding", size(appearance.answerPadding, 8, 32, 16) + "px");
        this.dataset.position = config.buttonPosition;
        this.dataset.desktop = String(config.showDesktop === true);
        this.dataset.mobile = String(config.showMobile === true);
        const searchLabel = this.launcher.querySelector("[data-pf-search-label]");
        const buttonText = config.buttonText.trim() || "Search";
        const characters = Array.from(buttonText);
        searchLabel.replaceChildren(...characters.map((character, index) => {
          const letter = document.createElement("span");
          letter.textContent = character;
          letter.style.setProperty("--pf-char-delay", index * 90 + "ms");
          return letter;
        }));
        this.launcher.classList.remove("pf-search-icon-ready", "pf-search-typing");
        this.launcher.setAttribute("aria-label", buttonText);
        this.querySelector("#product-finder-title").textContent = config.title;
        const description = this.querySelector("#product-finder-description");
        description.textContent = config.description || "";
        description.hidden = !config.description;
        this.renderStep(false);
        this.hidden = false;
        const expandedWidth = Math.min(320, Math.max(130, Math.ceil(searchLabel.scrollWidth) + 88));
        this.launcher.style.setProperty("--pf-search-expanded-width", expandedWidth + "px");
        this.launcher.classList.add("pf-search-collapsed");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.searchMorphTimer = window.setTimeout(() => {
          if (!this.isConnected) return;
          this.launcher.classList.remove("pf-search-collapsed");
          this.launcher.classList.add("pf-search-typing");
          const typingDuration = reducedMotion ? 0 : Math.min(6000, Math.max(0, (characters.length - 1) * 90 + 320));
          this.searchIconTimer = window.setTimeout(() => {
            if (!this.isConnected) return;
            this.launcher.classList.remove("pf-search-typing");
            this.launcher.classList.add("pf-search-icon-ready");
          }, typingDuration);
        }, reducedMotion ? 0 : 300);
        const compare = document.querySelector("product-compare-app");
        if (compare) {
          this.observer = new MutationObserver(() => this.schedulePosition());
          this.observer.observe(compare, { childList: true, attributes: true, subtree: true });
          if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.schedulePosition());
            this.resizeObserver.observe(compare);
          }
        }
        this.schedulePosition();
      } catch {
        // A failed optional widget must never affect the theme or comparison controls.
        this.hidden = true;
      } finally {
        window.clearTimeout(timeout);
      }
    }
    deviceEnabled() {
      return this.config && (this.media.matches ? this.config.showMobile : this.config.showDesktop);
    }
    schedulePosition() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        const compare = document.querySelector(".product-compare-launcher");
        let bottomOffset = 0;
        let centerOffset = 0;
        let stacked = false;
        if (compare && !compare.hidden) {
          const rect = compare.getBoundingClientRect();
          if (rect.height && getComputedStyle(compare).display !== "none" && compare.dataset.position === this.dataset.position) {
            const launcherHeight = this.launcher.getBoundingClientRect().height || 44;
            const stackTop = rect.bottom + 12;
            if (stackTop + launcherHeight <= window.innerHeight - 12) {
              stacked = true;
              const alignLeft = rect.left + rect.width / 2 <= window.innerWidth / 2;
              this.dataset.compareStackSide = alignLeft ? "left" : "right";
              this.style.setProperty("--pf-compare-stack-top", stackTop + "px");
              this.style.setProperty("--pf-compare-stack-inline", (alignLeft ? rect.left : window.innerWidth - rect.right) + "px");
            } else {
              if (this.dataset.position.startsWith("center_")) centerOffset = rect.height + 12;
              else bottomOffset = Math.max(0, window.innerHeight - rect.top + 12);
            }
          }
        }
        this.dataset.compareStacked = String(stacked);
        if (!stacked) {
          delete this.dataset.compareStackSide;
          this.style.removeProperty("--pf-compare-stack-top");
          this.style.removeProperty("--pf-compare-stack-inline");
        }
        this.style.setProperty("--pf-bottom-offset", bottomOffset + "px");
        this.style.setProperty("--pf-center-offset", centerOffset + "px");
      });
    }
    open() {
      if (!this.deviceEnabled() || this.dialog.open) return;
      if (this.complete && this.resultsApi) this.renderStep(false);
      this.dispatchEvent(new CustomEvent("product-compare:analytics", {
        bubbles: true,
        detail: { eventType: "product_finder_opened", source: "product_finder" },
      }));
      this.returnFocus = document.activeElement;
      this.dialog.showModal();
      document.documentElement.classList.add("product-finder-open");
      this.focusStep();
    }
    onClose() {
      document.documentElement.classList.remove("product-finder-open");
      if (this.returnFocus?.isConnected && this.deviceEnabled()) this.returnFocus.focus();
    }
    focusStep() {
      this.querySelector("[data-finder-step] [tabindex]")?.focus();
    }
    renderStep(focus) {
      const { questions } = this.config;
      const area = this.querySelector("[data-finder-step]");
      const back = this.querySelector("[data-finder-back]");
      const next = this.querySelector("[data-finder-next]");
      const progress = this.querySelector("[data-finder-progress]");
      progress.max = questions.length;
      progress.value = this.complete ? questions.length : this.index + 1;
      this.querySelector("[data-finder-progress-label]").textContent = this.complete ? "Quiz complete" : `Question ${this.index + 1} of ${questions.length}`;
      area.replaceChildren();
      if (this.complete) {
        back.hidden = false; back.textContent = "Edit answers";
        next.disabled = this.resultState === "loading"; next.textContent = this.results?.products?.length === 0 ? "Start again →" : "Start again";
        if (this.resultsApi) this.resultsApi.renderResults(this);
        else {
          const message = element("p", this.resultsError || "Finding your matches…");
          message.setAttribute("role", "status");
          area.append(message);
          if (this.resultsError) {
            const retry = element("button", "Try again", "pf-secondary");
            retry.type = "button";
            retry.addEventListener("click", () => void this.finish());
            area.append(retry);
          }
        }
      } else {
        const question = questions[this.index];
        const fieldset = element("fieldset", undefined, "pf-answers pf-luxury-answers");
        const legend = element("legend", question.question, "pf-question pf-luxury-question");
        legend.tabIndex = -1;
        fieldset.append(legend);
        for (const answer of question.answers) {
          const label = element("label", undefined, "pf-answer pf-luxury-answer");
          const input = element("input");
          input.type = question.selectionMode === "multiple" ? "checkbox" : "radio"; input.name = "product-finder-answer"; input.value = answer.id;
          input.checked = (this.answers.get(question.id) || []).includes(answer.id);
          label.append(input, element("span", answer.label, "pf-luxury-answer-label"));
          fieldset.append(label);
        }
        area.append(fieldset);
        back.hidden = this.index === 0; back.textContent = "Back";
        next.disabled = !(this.answers.get(question.id)?.length);
        next.textContent = this.index === questions.length - 1 ? "Find my matches →" : "Next →";
      }
      if (focus) this.focusStep();
    }
    async finish() {
      this.complete = true;
      this.results = null;
      this.resultsPage = 0;
      this.resultsError = "";
      this.resultState = "loading";
      this.renderStep(true);
      try {
        this.resultsApi ||= await import(this.dataset.resultsModule);
        if (!this.isConnected || !this.complete) return;
        await this.resultsApi.loadResults(this);
      } catch {
        if (!this.isConnected || !this.complete) return;
        this.resultState = "error";
        this.resultsError = "Recommendations could not load. Please try again.";
        this.renderStep(true);
      }
    }
    disconnectedCallback() {
      this.resultController?.abort();
      if (this.searchMorphTimer) window.clearTimeout(this.searchMorphTimer);
      if (this.searchIconTimer) window.clearTimeout(this.searchIconTimer);
      this.controller?.abort();
      this.controller = null;
      this.observer?.disconnect();
      this.resizeObserver?.disconnect();
      if (this.frame) cancelAnimationFrame(this.frame);
      if (this.dialog?.open) {
        this.dialog.close();
        document.documentElement.classList.remove("product-finder-open");
      }
    }
  }
  customElements.define("product-finder-app", ProductFinder);
})();
