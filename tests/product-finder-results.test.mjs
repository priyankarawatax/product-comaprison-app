/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const compareSource = read("../extensions/product-compare/assets/product-compare.js");
const compareApiSource = read("../theme-src/product-compare/product-compare-api.js");
const resultsSource = read("../theme-src/product-finder/product-finder-results.js");
const template = read("../extensions/product-compare/blocks/app-embed.liquid").split("<template data-compare-modal>")[1].split("</template>")[0];
const product = { id: "1", variantId: "12", key: "1:12", title: "Shirt", variantTitle: "Blue",
  url: "/products/shirt?variant=12", price: "$25.00", priceAmount: 2500, available: true, image: "", canCompare: true, matchPercentage: 100 };
function setup(t) {
  const dom = new JSDOM("<main></main>", { url: "https://test.myshopify.com/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.eval(compareSource);
  const compare = window.document.createElement("product-compare-app");
  compare.innerHTML = "<template data-compare-modal>" + template + "</template>";
  window.document.body.append(compare);
  compare.api = window.eval("(() => { " + compareApiSource.replaceAll("export ", "") + "; return { renderList, appendCartControls, addToCart, loadDetails: async () => {} }; })()");
  const app = window.document.createElement("div");
  app.innerHTML = "<dialog></dialog><div data-finder-step></div>";
  app.dialog = app.querySelector("dialog");
  app.complete = true;
  app.config = { id: "finder", version: 1, questions: [{ id: "q" }] };
  app.answers = new Map([["q", "a"]]);
  app.dataset.endpoint = "/apps/product-comparison/product-finder";
  app.dataset.routesRoot = "/"; app.dataset.currency = "USD";
  app.results = { heading: "Recommended", products: [product] };
  app.resultState = "ready";
  const api = window.eval("(() => { " + resultsSource.replaceAll("export ", "") + "; return { loadResults, renderResults, compareProducts }; })()");
  app.renderStep = () => api.renderResults(app);
  window.document.body.append(app);
  t.after(() => { compare.remove(); app.remove(); window.close(); });
  return { app, compare, window, api };
}
test("Finder uses existing list, keeps exact variants, avoids toggle-off, and opens real comparison table", async (t) => {
  const { app, compare, window, api } = setup(t);
  const existing = { ...product, variantId: "11", key: "1:11", url: "/products/shirt?variant=11" };
  compare.toggle(existing);
  await api.compareProducts(app, [product]);
  await api.compareProducts(app, [product]);
  assert.deepEqual(JSON.parse(window.localStorage.getItem("product-compare:list:v1")).map((p) => p.variantId), ["11", "12"]);
  app.dialog.showModal();
  await api.compareProducts(app, [product], true);
  assert.equal(app.dialog.open, false);
  assert.equal(compare.dialog.open, true);
  assert.match(compare.tableArea.textContent, /Shirt/);
  assert.equal(compare.items.length, 2);
});
test("results do not show a compare-all button", (t) => {
  const { app, api } = setup(t);
  api.renderResults(app);
  assert.equal(app.querySelector(".pf-compare-all"), null);
  assert.doesNotMatch(app.textContent, /Compare recommended products/);
});test("no-comparison products are not added and storage failure is reported", async (t) => {
  const { app, compare, window, api } = setup(t);
  await api.compareProducts(app, [{ ...product, canCompare: false }]);
  assert.equal(compare.items.length, 0);
  window.Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  await api.compareProducts(app, [product]);
  assert.equal(compare.items.length, 0);
  assert.match(app.compareError, /storage/i);
});
test("recommendation errors offer retry; empty results are not shown as fake matches", async (t) => {
  const { app, window, api } = setup(t);
  window.fetch = async () => ({ ok: false, json: async () => ({ error: "Quiz changed. Refresh." }) });
  await api.loadResults(app);
  assert.equal(app.resultState, "error");
  assert.match(app.textContent, /Quiz changed/);
  window.fetch = async () => ({ ok: true, json: async () => ({ heading: "Matches", products: [] }) });
  await api.loadResults(app);
  assert.equal(app.resultState, "ready");
  assert.match(app.textContent, /No matching products/);
  assert.doesNotMatch(app.textContent, /Popular picks for you/);
  window.fetch = async (_url, options = {}) => options.method === "POST"
    ? { ok: true, json: async () => ({ heading: "Matches", products: [] }) }
    : { ok: true, json: async () => ({ products: [{ id: 2, handle: "popular-bag", title: "Popular bag", available: true, price: 1999, variants: [{ id: 22, available: true, price: 1999 }] }] }) };
  await api.loadResults(app);
  assert.match(app.textContent, /Popular picks for you/);
  assert.match(app.textContent, /Popular bag/);
  assert.equal(app.querySelector(".pf-popular-card").getAttribute("href"), "/products/popular-bag?variant=22");
});
test("shared comparison keeps its separate list without overwriting saved products", async (t) => {
  const { app, compare, window, api } = setup(t);
  compare.toggle({ ...product, id: "2", key: "2:22", variantId: "22" });
  const before = window.localStorage.getItem("product-compare:list:v1");
  compare.sharedView = true; compare.items = [];
  await api.compareProducts(app, [product]);
  assert.equal(compare.items[0].variantId, "12");
  assert.equal(window.localStorage.getItem("product-compare:list:v1"), before);
});
test("already-saved variants from another tab refresh the current comparison without removal", async (t) => {
  const { app, compare, window, api } = setup(t);
  window.localStorage.setItem("product-compare:list:v1", JSON.stringify([product]));
  assert.equal(compare.items.length, 0);
  await api.compareProducts(app, [product]);
  assert.equal(compare.items.length, 1);
  assert.equal(app.compareError, "");
  assert.equal(compare.items[0].variantId, "12");
});