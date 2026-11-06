/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const source = readFileSync(
  new URL(
    "../extensions/product-compare/assets/product-compare.js",
    import.meta.url,
  ),
  "utf8",
);
const modalMarkup = readFileSync(new URL("../extensions/product-compare/blocks/app-embed.liquid", import.meta.url), "utf8").match(/<template data-compare-modal>[\s\S]*?<\/template>/)[0];
const key = "product-compare:list:v1";
const apiSource = readFileSync(new URL("../theme-src/product-compare/product-compare-api.js", import.meta.url), "utf8");
const shareSource = readFileSync(new URL("../theme-src/product-compare/product-compare-share.js", import.meta.url), "utf8");
const product = {
  id: "1",
  title: "Test product",
  url: "/products/test",
  variantIds: [11, 12],
  variantId: "11",
  variants: [
    { variantId: "11", variantTitle: "Small", price: "USD 19.00", sku: "S", available: true },
    { variantId: "12", variantTitle: "Large", price: "USD 25.00", sku: "L", available: true },
  ],
  price: "USD 19.00",
  vendor: "Test",
  type: "Shirt",
  available: true,
};
function setup(t, settings = {}, extra = "") {
  const dom = new JSDOM(
    `<main><form action="/cart/add"><input name="id" value="11"><button name="add" type="submit">Add to cart</button></form>${extra}</main>`,
    {
      url: "https://test.myshopify.com/products/test",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  );
  const { window } = dom;
  window.fetch = async () => { throw new Error("Offline"); };
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event("close"));
  };
  window.eval(source);
  const app = window.document.createElement("product-compare-app");
  Object.assign(app.dataset, {
    product: JSON.stringify(product),
    position: "bottom_right",
    notifications: "true",
    placement: "after",
    display: "button",
    ...settings,
  });
  app.innerHTML = modalMarkup;
  window.document.body.append(app);
  app.api = window.eval(`(() => { ${apiSource.replaceAll("export ", "")} return { loadDetails, addToCart, appendCartControls, renderList }; })()`);
  app.shareApi = window.eval(`(() => { ${shareSource.replaceAll("export ", "")} return { copyLink, openShared, removeAll }; })()`);
  t.after(() => {
    app.remove();
    window.close();
  });
  return { window, app, document: window.document };
}
test("button toggles selection, count, aria state and notifications", (t) => {
  const { document, window, app } = setup(t);
  const button = document.querySelector(".product-compare-control button");
  button.click();
  assert.equal(JSON.parse(window.localStorage.getItem(key)).length, 1);
  assert.equal(app.launcher.textContent, "Compare (1)");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(app.toast.hidden, true);
  button.click();
  assert.deepEqual(JSON.parse(window.localStorage.getItem(key)), []);
  assert.equal(app.toast.hidden, true);
});

test("adding beyond the 10-product limit replaces the oldest product", (t) => {
  const { document, window, app } = setup(t, { comparisonLimit: "10" });
  const savedProducts = Array.from({ length: 10 }, (_, index) => ({
    ...product,
    id: String(index + 2),
    variantId: String(index + 20),
    title: `Product ${index + 2}`,
    url: `/products/product-${index + 2}`,
  }));
  window.localStorage.setItem(key, JSON.stringify(savedProducts));
  app.items = app.readSavedList();
  app.sync();

  const button = document.querySelector(".product-compare-control button");
  button.click();

  assert.equal(app.items.length, 10);
  assert.equal(JSON.parse(window.localStorage.getItem(key)).length, 10);
  assert.equal(app.items[0].id, "3");
  assert.equal(app.items.at(-1).id, product.id);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(app.toast.textContent, /Product 2 was removed/);

  window.localStorage.setItem(key, JSON.stringify([product, ...savedProducts.slice(0, 9)]));
  app.items = app.readSavedList();
  app.sync();
  button.click();

  assert.equal(app.items.length, 9);
  assert.equal(JSON.parse(window.localStorage.getItem(key)).length, 9);
  assert.equal(button.getAttribute("aria-pressed"), "false");
});
test("free plan keeps 2 products and replaces the oldest when a third is added", (t) => {
  const { document, window, app } = setup(t, { comparisonLimit: "2" });
  const savedProducts = [
    { ...product, id: "2", variantId: "20", url: "/products/product-2" },
    { ...product, id: "3", variantId: "30", url: "/products/product-3" },
  ];
  window.localStorage.setItem(key, JSON.stringify(savedProducts));
  app.items = app.readSavedList();
  app.sync();

  document.querySelector(".product-compare-control button").click();

  assert.equal(app.items.length, 2);
  assert.equal(app.items[0].id, "3");
  assert.equal(app.items[1].id, product.id);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(key)).map((item) => item.id), ["3", product.id]);
  assert.match(app.toast.textContent, /Test product was removed/);
});
test("selected variant loads its image and stays selected when adding to cart", async (t) => {
  const { app, window, document } = setup(t, { routesRoot: "/fr/" });
  const calls = [];
  window.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => options?.method === "POST" ? { items: [{ id: 12 }] } : {
      id: 1, featured_image: "//cdn.shopify.com/product.jpg", variants: [
        { id: 11, title: "Small", available: true },
        { id: 12, title: "Large", available: true },
      ],
    } };
  };
  document.querySelector('[name="id"]').value = "12";
  document.querySelector(".product-compare-control button").click();
  app.dialog.showModal();
  await app.loadDetails();
  assert.equal(calls[0].url, "/fr/products/test.js");
  assert.equal(app.tableArea.querySelector("img").src, "https://cdn.shopify.com/product.jpg");
  assert.equal(JSON.parse(window.localStorage.getItem(key))[0].image, "https://cdn.shopify.com/product.jpg");
  for (const selector of [".product-compare-media", ".product-compare-title"]) {
    assert.equal(app.tableArea.querySelector(selector).getAttribute("href"), product.url + "?variant=12");
  }
  assert.equal(app.tableArea.querySelector("select"), null);
  assert.equal(app.items[0].variantId, "12");
  await app.addToCart(app.items[0], app.tableArea.querySelector(".product-compare-view"));
  assert.equal(calls[1].url, "/fr/cart/add.js");
  assert.deepEqual(JSON.parse(calls[1].options.body), { items: [{ id: "12", quantity: 1 }] });
  assert.equal(app.dialog.querySelector("[data-compare-cart-status]").textContent, "");
  assert.equal(app.tableArea.querySelector(".product-compare-remove").textContent, "\u00d7");
  assert.equal(app.tableArea.querySelector(".product-compare-view").textContent, "Added to cart");
  app.renderList();
  assert.equal(app.tableArea.querySelector(".product-compare-view").disabled, true);
  await app.addToCart(app.items[0], app.tableArea.querySelector(".product-compare-view"));
  assert.equal(calls.length, 2);
});

test("cart errors are visible and the button can be retried", async (t) => {
  const { app, window, document } = setup(t);
  document.querySelector(".product-compare-control button").click();
  app.details.set("1:11", { selected: "11", variants: [{ id: 11, available: true }] });
  app.dialog.showModal();
  app.renderList();
  window.fetch = async () => ({ ok: false, json: async () => ({ description: "Not enough stock" }) });
  await app.addToCart(app.items[0], app.tableArea.querySelector(".product-compare-view"));
  assert.match(app.dialog.querySelector("[data-compare-cart-status]").textContent, /Not enough stock/);
  assert.equal(app.tableArea.querySelector(".product-compare-view").disabled, false);
});

test("two variants of one product are saved separately with their own details", (t) => {
  const { app, document, window } = setup(t);
  const control = document.querySelector(".product-compare-control button");
  const variant = document.querySelector('[name="id"]');
  control.click();
  variant.value = "12";
  variant.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(control.getAttribute("aria-pressed"), "false");
  control.click();
  const stored = JSON.parse(window.localStorage.getItem(key));
  assert.deepEqual(stored.map((item) => item.variantId), ["11", "12"]);
  assert.deepEqual(stored.map((item) => item.sku), ["S", "L"]);
  assert.equal(stored[1].price, "USD 25.00");
  assert.equal(stored[1].url, "/products/test?variant=12");
  control.click();
  assert.equal(app.items.length, 1);
  assert.equal(app.items[0].variantId, "11");
});
test("placement works before and after add to cart without submitting it", (t) => {
  for (const placement of ["before", "after"]) {
    const { document } = setup(t, { placement });
    const cart = document.querySelector("[name=add]");
    assert.ok(
      (placement === "before"
        ? cart.previousElementSibling
        : cart.nextElementSibling
      ).classList.contains("product-compare-control"),
    );
    assert.equal(
      document.querySelector(".product-compare-control button").type,
      "button",
    );
  }
});
test("checkbox display toggles the same persistent list", (t) => {
  const { document, window } = setup(t, { display: "checkbox" });
  const checkbox = document.querySelector(".product-compare-control input");
  assert.equal(checkbox.type, "checkbox");
  checkbox.click();
  assert.equal(checkbox.checked, true);
  assert.equal(JSON.parse(window.localStorage.getItem(key))[0].id, "1");
});
test("notification preference suppresses normal add/remove toasts", (t) => {
  const { document, app } = setup(t, { notifications: "false" });
  document.querySelector(".product-compare-control button").click();
  assert.equal(app.toast.hidden, true);
});
test("Liquid exclusion flag suppresses controls and launcher", (t) => {
  const { document, app } = setup(t, { excluded: "true" });
  assert.equal(document.querySelector(".product-compare-control"), null);
  assert.equal(app.launcher.hidden, true);
});
test("explicit block replaces automatic placement, without duplicates", (t) => {
  const { document, app } = setup(
    t,
    {},
    '<product-comparison-slot data-product-id="1"></product-comparison-slot>',
  );
  app.mountControls();
  app.mountControls();
  assert.equal(document.querySelectorAll(".product-compare-control").length, 1);
  assert.ok(
    document.querySelector("product-comparison-slot .product-compare-control"),
  );
});
test("forms for other products are not injected", (t) => {
  const { document } = setup(
    t,
    {},
    '<form action="/cart/add"><input name="id" value="999"><button name="add">Other product</button></form>',
  );
  assert.equal(document.querySelectorAll(".product-compare-control").length, 1);
});
test("scroll hides main button temporarily, all position choices are retained", async (t) => {
  for (const position of [
    "center_left",
    "center_right",
    "bottom_right",
    "bottom_left",
  ]) {
    const { app, window, document } = setup(t, { position, hideOnScroll: "true" });
    document.querySelector(".product-compare-control button").click();
    assert.equal(app.launcher.hidden, false);
    assert.equal(app.launcher.dataset.position, position);
    window.dispatchEvent(new window.Event("scroll"));
    assert.equal(app.launcher.hidden, true);
    await new Promise((resolve) => setTimeout(resolve, 230));
    assert.equal(app.launcher.hidden, false);
  }
});
test("other tabs update selected controls, and invalid stored URLs are ignored", (t) => {
  const { app, window, document } = setup(t);
  window.localStorage.setItem(
    key,
    JSON.stringify([
      product,
      { ...product, id: "2", url: "https://attacker.test/products/x" },
    ]),
  );
  window.dispatchEvent(new window.StorageEvent("storage", { key }));
  assert.equal(app.launcher.textContent, "Compare (1)");
  assert.equal(
    document
      .querySelector(".product-compare-control button")
      .getAttribute("aria-pressed"),
    "true",
  );
});
test("dialog shows selected products safely and supports removal", (t) => {
  const { app, document } = setup(t, {
    product: JSON.stringify({
      ...product,
      title: "<img src=x onerror=alert(1)>",
    }),
  });
  document.querySelector(".product-compare-control button").click();
  app.launcher.click();
  assert.equal(app.dialog.open, true);
  assert.equal(app.tableArea.querySelector("img"), null);
  app.tableArea.querySelector("[data-remove-id]").click();
  assert.equal(app.dialog.open, false);
  assert.equal(app.items.length, 0);
});
test("theme re-render reconnects controls once and cleans up on disconnect", (t) => {
  const { app, document } = setup(t);
  const first = document.querySelector(".product-compare-control");
  first.remove();
  app.mountControls();
  assert.equal(document.querySelectorAll(".product-compare-control").length, 1);
  app.remove();
  assert.equal(document.querySelectorAll(".product-compare-control").length, 0);
  document.body.append(app);
  assert.equal(document.querySelectorAll(".product-compare-control").length, 1);
});

test("premium modal uses Liquid markup, highlights rows and restores scroll", (t) => {
  const { app, document, window } = setup(t);
  const first = { ...product, image: "https://cdn.shopify.com/test.jpg", priceAmount: 1900, sku: "SKU-1" };
  const second = { ...product, id: "2", title: "Second product", price: "USD 25.00", priceAmount: 2500, sku: "SKU-2" };
  window.localStorage.setItem(key, JSON.stringify([first, second]));
  window.dispatchEvent(new window.StorageEvent("storage", { key }));
  document.documentElement.style.overflow = "auto";
  app.launcher.click();
  assert.ok(app.dialog.querySelector(".product-compare-modal-header"));
  assert.ok(app.dialog.classList.contains("pc-modal"));
  assert.match(app.dialog.querySelector(".pc-highlight-sidebar").textContent, /Show matching details/);
  assert.equal(document.documentElement.style.overflow, "hidden");
  assert.equal(app.tableArea.querySelector("img").src, first.image);
  assert.equal(app.tableArea.querySelectorAll(".product-compare-view").length, 2);
  assert.equal(app.tableArea.querySelectorAll('[data-field="price"] .pc-price-lowest').length, 0);
  assert.equal(app.tableArea.querySelectorAll('[data-field="price"] .pc-price-higher').length, 0);
  app.similarities.click();
  app.differences.click();
  const labels = [...app.tableArea.querySelectorAll("tbody th")].map((cell) => cell.textContent);
  assert.ok(labels.includes("Price"));
  assert.ok(labels.includes("SKU"));
  assert.ok(labels.includes("Vendor"));
  assert.ok([...app.tableArea.querySelectorAll(".product-compare-similar th")].some((cell) => cell.textContent === "Vendor"));
  assert.ok([...app.tableArea.querySelectorAll(".product-compare-different th")].some((cell) => cell.textContent === "Price"));
  assert.equal(app.tableArea.querySelectorAll('[data-field="price"] .pc-price-lowest').length, 1);
  assert.equal(app.tableArea.querySelectorAll('[data-field="price"] .pc-price-higher').length, 1);
  app.similarities.click();
  assert.equal(app.tableArea.querySelectorAll(".product-compare-similar").length, 0);
  assert.ok(app.tableArea.querySelector(".product-compare-different"));
  app.dialog.querySelector("[data-compare-close]").click();
  assert.equal(document.documentElement.style.overflow, "auto");
  assert.equal(document.activeElement, app.launcher);
  app.launcher.click();
  app.remove();
  assert.equal(document.documentElement.style.overflow, "auto");
});


test("copied link restores exact variants in another browser without overwriting its list", async (t) => {
  const sender = setup(t);
  sender.document.querySelector(".product-compare-control button").click();
  sender.document.querySelector('[name="id"]').value = "12";
  sender.document.querySelector(".product-compare-control button").click();
  sender.app.similarities.checked = true;
  let copied;
  Object.defineProperty(sender.window.navigator, "clipboard", { value: { writeText: async (value) => { copied = value; } } });
  await sender.app.shareAction("copyLink");
  assert.ok(copied.includes("#compare="));
  const receiver = setup(t, { currency: "USD" });
  receiver.window.localStorage.setItem(key, JSON.stringify([product]));
  const saved = receiver.window.localStorage.getItem(key);
  receiver.window.fetch = async () => ({ ok: true, json: async () => ({ id: 1, title: "Actual product title", vendor: "Actual vendor", type: "Shirt", description: "<p>Description</p>", variants: [
    { id: 11, title: "Small", price: 1900, available: true },
    { id: 12, title: "Large", price: 2500, available: true },
  ] }) });
  receiver.window.history.replaceState(null, "", copied);
  await receiver.app.shareAction("openShared");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(receiver.app.dialog.open, true);
  assert.equal(receiver.app.sharedView, true);
  assert.equal(receiver.app.similarities.checked, true);
  assert.deepEqual(Array.from(receiver.app.items, (item) => item.variantId), ["11", "12"]);
  assert.equal(receiver.app.items[0].title, "Actual product title");
  assert.equal(receiver.window.localStorage.getItem(key), saved);
  await receiver.app.shareAction("removeAll");
  assert.equal(receiver.app.items.length, 0);
  assert.equal(receiver.window.localStorage.getItem(key), saved);
  assert.equal(receiver.app.dialog.open, false);
});

test("remove all clears saved comparison and copy falls back to a selectable link", async (t) => {
  const { app, document, window } = setup(t);
  document.querySelector(".product-compare-control button").click();
  await app.shareAction("copyLink");
  const input = app.dialog.querySelector("[data-compare-share-link]");
  assert.equal(input.hidden, false);
  assert.ok(input.value.includes("#compare="));
  await app.shareAction("removeAll");
  assert.equal(window.localStorage.getItem(key), "[]");
  assert.equal(app.launcher.textContent, "Compare (0)");
  assert.equal(document.querySelector(".product-compare-control button").getAttribute("aria-pressed"), "false");
  assert.equal(app.dialog.querySelector("[data-compare-copy]").disabled, true);
  assert.equal(app.dialog.open, false);
});

test("invalid share payload cannot replace saved comparison or fetch external URLs", async (t) => {
  const { app, document, window } = setup(t);
  document.querySelector(".product-compare-control button").click();
  const saved = window.localStorage.getItem(key);
  window.history.replaceState(null, "", "/#" + new URLSearchParams({ compare: JSON.stringify({ v: 1, items: [["1", "11", "https://evil.example/x"]] }) }));
  await app.shareAction("openShared");
  assert.equal(app.sharedView, false);
  assert.equal(window.localStorage.getItem(key), saved);
  assert.match(app.dialog.querySelector("[data-compare-share-status]").textContent, /invalid/);
});

test("saved merchant row order is applied, unknown fields ignored and missing rows retained", (t) => {
  const { app, document } = setup(t, { rowOrder: JSON.stringify(["description", "sku", "sku", "unknown", "price"]) });
  document.querySelector(".product-compare-control button").click();
  app.dialog.showModal();
  app.renderList();
  assert.deepEqual(Array.from(app.tableArea.querySelectorAll("tbody th"), (cell) => cell.textContent), ["SKU", "Price", "Variant", "Vendor", "Product type", "Availability", "Customer rating", "Reviews", "Total sold", "Description"]);
});

test("disabled rows are omitted while enabled rows retain their saved order", (t) => {
  const { app, document } = setup(t, { rowOrder: JSON.stringify(["description", "sku", "price"]), disabledRows: JSON.stringify(["sku", "vendor"]) });
  document.querySelector(".product-compare-control button").click();
  app.dialog.showModal();
  app.renderList();
  assert.deepEqual(Array.from(app.tableArea.querySelectorAll("tbody th"), (cell) => cell.textContent), ["Price", "Variant", "Product type", "Availability", "Customer rating", "Reviews", "Total sold", "Description"]);
  app.dataset.disabledRows = JSON.stringify(["description", "sku", "price", "variantTitle", "vendor", "type", "available"]);
  app.renderList();
  assert.deepEqual(Array.from(app.tableArea.querySelectorAll("tbody th"), (cell) => cell.textContent), ["Customer rating", "Reviews", "Total sold"]);
});

test("saved row labels rename storefront headings", (t) => {
  const { app, document } = setup(t, { rowLabels: JSON.stringify({ price: "Our price", soldCount: "Purchased" }) });
  document.querySelector(".product-compare-control button").click();
  app.dialog.showModal();
  app.renderList();
  const headings = Array.from(app.tableArea.querySelectorAll("tbody th"), (cell) => cell.textContent);
  assert.ok(headings.includes("Our price"));
  assert.ok(headings.includes("Purchased"));
  assert.equal(headings.includes("Price"), false);
  assert.equal(headings.includes("Total sold"), false);
});

test("customer rating and review count render in comparison rows", (t) => {
  const { app } = setup(t);
  app.items = [
    { ...product, key: "1:11", rating: 4.6, reviewCount: 128 },
    { ...product, id: "2", key: "2:22", variantId: "22", title: "Second product", url: "/products/second", rating: null, reviewCount: null },
  ];
  app.dialog.showModal();
  app.renderList();
  const ratingCells = app.tableArea.querySelectorAll('[data-field="rating"] td');
  const countCells = app.tableArea.querySelectorAll('[data-field="reviewCount"] td');
  assert.match(ratingCells[0].textContent, /4\.6\/5/);
  assert.equal(ratingCells[0].querySelector(".pc-rating-stars").textContent, "★★★★★");
  assert.equal(ratingCells[0].querySelector(".pc-rating-stars").getAttribute("aria-hidden"), "true");
  assert.equal(ratingCells[0].getAttribute("aria-label"), "4.6 out of 5 stars");
  assert.equal(ratingCells[1].textContent, "\u2014");
  assert.equal(countCells[0].textContent, "128");
  assert.equal(countCells[1].textContent, "\u2014");
});

test("description is the last row and hides content after five bullets", (t) => {
  const { app } = setup(t);
  app.items = [{ ...product, key: "1:11", description: "First point. Second point. Third point. Fourth point. Fifth point. Remaining details stay visible." }];
  app.dialog.showModal();
  app.renderList();
  const rows = app.tableArea.querySelectorAll("tbody tr");
  const description = rows[rows.length - 1];
  assert.equal(description.dataset.field, "description");
  assert.equal(description.querySelectorAll("li").length, 5);
  assert.doesNotMatch(description.textContent, /Remaining details stay visible/);
});

test("opening comparison renders saved rows without loading text while product requests are pending", (t) => {
  const { app, document, window } = setup(t);
  window.fetch = () => new Promise(() => {});
  document.querySelector(".product-compare-control button").click();
  app.openComparison();
  assert.equal(app.dialog.open, true);
  assert.ok(app.tableArea.querySelector("table"));
  assert.match(app.tableArea.textContent, /USD 19.00/);
  assert.doesNotMatch(app.tableArea.textContent, /Loading|Load product/);
  assert.equal(app.tableArea.querySelector(".product-compare-view").textContent, "Add to cart");
  assert.equal(app.tableArea.querySelector(".product-compare-view").disabled, true);
});

test("smart badges render accessibly in a dedicated comparison row", (t) => {
  const { app } = setup(t);
  app.items = [
    { ...product, key: "1:11" },
    { ...product, id: "2", key: "2:22", variantId: "22", title: "Second product", url: "/products/second" },
  ];
  app.badgesApi = { BADGE_LABELS: { best_value: "Best Value", lowest_price: "Lowest Price" } };
  app.badgeLabels = { best_value: "Top Choice", lowest_price: "Best Price" };
  app.smartBadgesEnabled = true;
  app.badgeAssignments = { "1:11": ["best_value", "lowest_price"], "2:22": [] };
  app.dialog.showModal();
  app.renderList();
  const row = app.tableArea.querySelector('[data-field="smartBadges"]');
  assert.equal(row.querySelector("th").textContent, "Smart Badges");
  const list = row.querySelector(".product-compare-badges");
  assert.equal(list.getAttribute("role"), "list");
  assert.equal(list.getAttribute("aria-label"), "Highlights for Test product");
  assert.deepEqual(Array.from(list.children, (badge) => badge.textContent), ["Top Choice", "Best Price"]);
  assert.equal(row.querySelectorAll("td")[1].textContent, "\u2014");
  assert.equal(app.tableArea.querySelector("thead .product-compare-badges"), null);
});
test("enabled Smart Badges row remains visible when the current products have no winner", (t) => {
  const { app } = setup(t);
  app.items = [
    { ...product, key: "1:11" },
    { ...product, id: "2", key: "2:22", variantId: "22", title: "Second product", url: "/products/second" },
  ];
  app.smartBadgesEnabled = true;
  app.badgeAssignments = { "1:11": [], "2:22": [] };
  app.dialog.showModal();
  app.renderList();
  const row = app.tableArea.querySelector('[data-field="smartBadges"]');
  assert.ok(row);
  assert.deepEqual(Array.from(row.querySelectorAll("td"), (cell) => cell.textContent), ["\u2014", "\u2014"]);
});test("columns sort by numeric variant price and customer drag keeps every row aligned", (t) => {
  const { app, document, window } = setup(t);
  app.items = [
    { ...product, key: "1:11", priceAmount: 120000, price: "€1.200,00", sku: "HIGH" },
    { ...product, key: "2:22", id: "2", priceAmount: 900, price: "€9,00", sku: "LOW" },
    { ...product, key: "3:33", id: "3", priceAmount: 10000, price: "€100,00", sku: "MID" },
  ];
  app.dialog.showModal();
  app.renderList();
  const keys = () => Array.from(app.tableArea.querySelectorAll('[data-column-focus]'), node => node.dataset.columnFocus);
  assert.deepEqual(keys(), ["2:22", "3:33", "1:11"]);
  const columns = [...app.tableArea.querySelectorAll('[data-column-focus]')];
  const dragHints = [...app.tableArea.querySelectorAll('.product-compare-drag-hint')];
  assert.equal(dragHints.length, 3);
  assert.ok(dragHints.every((hint) => hint.textContent === "⠿" && hint.getAttribute("aria-hidden") === "true" && hint.title === "Drag to reorder"));
  columns.forEach((node, index) => { node.getBoundingClientRect = () => ({ left: 100 + index * 200, right: 300 + index * 200 }); });
  const pointer = (target, type, x) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  };
  pointer(app.tableArea.querySelector('[data-column-focus="1:11"]'), "pointerdown", 600);
  pointer(document, "pointermove", 150);
  pointer(document, "pointerup", 150);
  assert.deepEqual(keys(), ["1:11", "2:22", "3:33"]);
  app.differences.checked = true;
  app.differences.dispatchEvent(new window.Event("change"));
  assert.deepEqual(keys(), ["1:11", "2:22", "3:33"]);
  const skuRow = [...app.tableArea.querySelectorAll('tbody tr')].find(row => row.querySelector('th').textContent === 'SKU');
  assert.deepEqual([...skuRow.querySelectorAll('td')].map(cell => cell.textContent), ["HIGH", "LOW", "MID"]);
  app.tableArea.querySelector('[data-column-focus="1:11"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.deepEqual(keys(), ["2:22", "1:11", "3:33"]);
});
