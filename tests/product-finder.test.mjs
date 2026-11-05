/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("../extensions/product-compare/assets/product-finder.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../extensions/product-compare/snippets/product-finder.liquid", import.meta.url), "utf8")
  .split("<product-finder-app")[1].split("</product-finder-app>")[0];
const resultsSource = readFileSync(new URL("../theme-src/product-finder/product-finder-results.js", import.meta.url), "utf8");
const config = {
  enabled: true, id: "finder", version: 1, title: "Find your product", description: "A short quiz.",
  buttonText: "Find the right product", buttonPosition: "bottom_left", showDesktop: true, showMobile: true,
  questions: [
    { id: "budget", question: "Your budget?", answers: [{ id: "low", label: "Under 500" }, { id: "high", label: "Over 500" }] },
    { id: "material", question: "Preferred material?", answers: [{ id: "cotton", label: "Cotton" }, { id: "silk", label: "Silk" }] },
  ],
};
async function setup(t, value = config, fail = false) {
  const dom = new JSDOM('<button id="theme-button">Theme button</button>', { url: "https://test.myshopify.com/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  const media = new window.EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  let requests = 0;
  window.fetch = async (url, options = {}) => {
    requests += 1;
    if (fail) throw new Error("offline");
    const payload = options.method === "POST"
      ? { heading: "Recommended for you", products: [{ id: "1", variantId: "12", handle: "shirt", title: "Shirt", matchPercentage: 100 }] }
      : String(url).endsWith(".js")
        ? { id: 1, title: "Shirt", variants: [{ id: 12, title: "Silk", price: 2500, available: true }], tags: [] }
        : value;
    return { ok: true, json: async () => payload };
  };
  window.eval(source);
  window.document.body.insertAdjacentHTML("beforeend", ("<product-finder-app" + markup + "</product-finder-app>").replace('{{ routes.root_url }}', '/'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const app = window.document.querySelector("product-finder-app");
  t.after(() => { app.remove(); window.close(); });
  app.resultsApi = window.eval("(() => { " + resultsSource.replaceAll("export ", "") + "; return { loadResults, renderResults, compareProducts }; })()");
  app.dataset.routesRoot = "/";
  app.dataset.currency = "USD";
  const find = (selector) => app.querySelector(selector);
  const select = (id) => {
    const input = find(`input[value="${id}"]`);
    input.checked = true;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  return { app, window, find, select, media, requests: () => requests };
}
test("quiz requires answers, preserves Back and reopen state, reviews and restarts without navigation", async (t) => {
  const { app, window, find, select, requests } = await setup(t);
  let finderOpens = 0;
  app.addEventListener("product-compare:analytics", (event) => {
    if (event.detail?.eventType === "product_finder_opened") finderOpens += 1;
  });
  assert.equal(app.hidden, false);
  assert.equal(find("dialog").open, false);
  find("[data-finder-open]").focus();
  find("[data-finder-open]").click();
  assert.equal(find("dialog").open, true);
  assert.equal(finderOpens, 1);
  assert.equal(find("[data-finder-next]").disabled, true);
  select("high");
  find("[data-finder-next]").click();
  assert.match(find("[data-finder-progress-label]").textContent, /2 of 2/);
  select("silk");
  find("[data-finder-back]").click();
  assert.equal(find('input[value="high"]').checked, true);
  find("[data-finder-close]").click();
  assert.equal(window.document.documentElement.classList.contains("product-finder-open"), false);
  assert.equal(window.document.activeElement, find("[data-finder-open]"));
  find("[data-finder-open]").click();
  assert.equal(finderOpens, 2);
  assert.equal(find('input[value="high"]').checked, true);
  find("[data-finder-next]").click();
  assert.equal(find('input[value="silk"]').checked, true);
  find("[data-finder-next]").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.doesNotMatch(find("[data-finder-step]").textContent, /% match/);
  assert.doesNotMatch(find("[data-finder-step]").textContent, /Recommended for you/);
  assert.match(find("[data-finder-step]").textContent, /Silk/);
  assert.equal(requests(), 3, "configuration, recommendations and current product details load once");
  assert.equal(window.location.pathname, "/");
  find("[data-finder-next]").click();
  assert.equal(find("[data-finder-next]").disabled, true);
  assert.equal(find("input:checked"), null);
});
test("disabled, empty and failed configs leave no visible Finder and preserve storefront", async (t) => {
  for (const [value, fail] of [[{ enabled: false }, false], [{ ...config, questions: [] }, false], [config, true]]) {
    const { app, window } = await setup(t, value, fail);
    assert.equal(app.hidden, true);
    assert.equal(window.document.documentElement.classList.contains("product-finder-open"), false);
    assert.ok(window.document.querySelector("#theme-button"));
  }
});
test("merchant text renders as text and disabled mobile closes the modal", async (t) => {
  const { app, window, find, media } = await setup(t, {
    ...config, showMobile: false, title: '<img src=x onerror="alert(1)">',
    questions: [{ ...config.questions[0], question: "<script>alert(1)</script>" }],
  });
  assert.equal(app.querySelector("img, script"), null);
  assert.match(find("#product-finder-title").textContent, /<img/);
  find("[data-finder-open]").click();
  media.matches = true;
  media.dispatchEvent(new window.Event("change"));
  assert.equal(find("dialog").open, false);
  assert.equal(app.dataset.mobile, "false");
  find("[data-finder-open]").click();
  assert.equal(find("dialog").open, false);
});
test("removing an open embed cleans up the scroll lock", async (t) => {
  const { app, window, find } = await setup(t);
  find("[data-finder-open]").click();
  app.remove();
  assert.equal(window.document.documentElement.classList.contains("product-finder-open"), false);
});
test("bottom center remains selected when the compare launcher uses another position", async (t) => {
  const { app, window } = await setup(t, { ...config, buttonPosition: "bottom_center" });
  const compare = window.document.createElement("button");
  compare.className = "product-compare-launcher";
  compare.dataset.position = "center_right";
  compare.getBoundingClientRect = () => ({ top: 120, right: 609, bottom: 240, left: 565, width: 44, height: 120 });
  window.document.body.append(compare);
  app.launcher.getBoundingClientRect = () => ({ height: 44 });
  app.schedulePosition();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  assert.equal(app.dataset.position, "bottom_center");
  assert.equal(app.dataset.compareStacked, "false");
  compare.remove();
});