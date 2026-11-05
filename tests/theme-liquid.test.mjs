/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
const file = readFileSync(
  new URL(
    "../extensions/product-compare/blocks/app-embed.liquid",
    import.meta.url,
  ),
  "utf8",
);
const template = file.replace(/{% schema %}[\s\S]*?{% endschema %}/, "");
const engine = new Liquid({ root: fileURLToPath(new URL("../extensions/product-compare/snippets/", import.meta.url)), extname: ".liquid" });
// LiquidJS does not yet implement Shopify's non-rendering LiquidDoc tag.
engine.registerTag("doc", {
  parse(_token, tokens) {
    while (tokens.length) {
      const token = tokens.shift();
      if (token.name === "enddoc") return;
    }
  },
  render() { return ""; },
});
engine.registerFilter("json", (value) => JSON.stringify(value ?? null));
engine.registerFilter(
  "money_with_currency",
  (value) => `USD ${Number(value) / 100}`,
);
async function render({
  tags = [],
  collections = [],
  excluded = [],
  collection = null,
  title = "Test",
} = {}) {
  const html = await engine.parseAndRender(template, {
    product: {
      id: 1,
      title,
      url: "/products/test",
      price: 1900,
      available: true,
      tags,
      collections,
      variants: [{ id: 11 }],
    },
    collection,
    block: {
      settings: {
        excluded_collections: excluded,
        main_button_position: "bottom_right",
        button_position: "after",
        button_display: "button",
        show_notifications: true,
        hide_on_scroll: false,
      },
    },
  });
  const dom = new JSDOM(html);
  const app = dom.window.document.querySelector("product-compare-app");
  const result = {
    excluded: app.dataset.excluded,
    comparisonLimit: app.dataset.comparisonLimit,
    product: JSON.parse(app.dataset.product),
  };
  dom.window.close();
  return result;
}
test("empty collection exclusions display on eligible products", async () =>
  assert.equal((await render()).excluded, "false"));
test("missing entitlement snapshot fails closed to a 2-product comparison", async () =>
  assert.equal((await render()).comparisonLimit, "2"));
test("no-comparison tag hides comparison regardless of collection", async () =>
  assert.equal((await render({ tags: ["no-comparison"] })).excluded, "true"));
test("membership in any selected collection excludes direct product visits", async () =>
  assert.equal(
    (
      await render({
        collections: [{ id: 7 }, { id: 8 }],
        excluded: [{ id: 8 }],
      })
    ).excluded,
    "true",
  ));
test("unrelated collections do not suppress product controls", async () =>
  assert.equal(
    (await render({ collections: [{ id: 7 }], excluded: [{ id: 8 }] }))
      .excluded,
    "false",
  ));
test("excluded collection landing pages hide the floating button", async () =>
  assert.equal(
    (await render({ collection: { id: 8 }, excluded: [{ id: 8 }] })).excluded,
    "true",
  ));
test("titles with quotes or HTML survive JSON attributes without injecting markup", async () => {
  const title = 'A "product" <script>alert(1)</script>';
  assert.equal((await render({ title })).product.title, title);
});
