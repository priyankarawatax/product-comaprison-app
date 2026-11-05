/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedRules, scoreVariant, rankProducts } from "../app/product-finder/scoring.ts";
import { loadFinderCatalog, catalogQuery } from "../app/product-finder/catalog.server.ts";

const rule = (field, operator, value, weight = 2) => ({ id: field, label: field, field, operator, value, weight });
const base = { id: "1", variantId: "11", title: "Shirt", handle: "shirt", price: 50, available: true,
  vendor: "Brand A", productType: "Shirts", tags: ["Cotton", "Summer"],
  options: [{ name: "Color", value: "Red" }], metafields: { "custom.material": ["Cotton", "Linen"], "custom.ram": 16 } };
test("all operators and supported product fields use weighted matches", () => {
  const cases = [
    ["price", "equals", "50", true], ["price", "less_than", "50", false],
    ["price", "less_than_or_equal", "50", true], ["price", "greater_than", "49", true],
    ["price", "greater_than_or_equal", "51", false], ["vendor", "equals", " brand a ", true],
    ["product_type", "contains", "shirt", true], ["tags", "equals", "cotton", true],
    ["tags", "equals", "cott", false], ["tags", "contains", "cott", true],
    ["availability", "equals", "true", true], ["variant_option.Color", "equals", "red", true],
    ["metafield.custom.material", "equals", "linen", true], ["metafield.custom.ram", "greater_than_or_equal", "16", true],
    ["metafield.custom.missing", "equals", "", false],
  ];
  for (const [field, operator, value, matched] of cases) assert.equal(scoreVariant(base, [rule(field, operator, value)]), matched ? 2 : 0, field + " " + operator);
});
test("scores one coherent variant and deduplicates products using its best variant", () => {
  const rules = [rule("price", "less_than_or_equal", "50", 3), rule("variant_option.Color", "equals", "Blue", 2)];
  const blue = { ...base, variantId: "12", price: 80, options: [{ name: "Color", value: "Blue" }] };
  const other = { ...base, id: "2", variantId: "21", price: 40, options: blue.options };
  const ranked = rankProducts([base, blue, other], rules, 3);
  assert.deepEqual(ranked.map((p) => [p.id, p.variantId, p.matchPercentage]), [["2", "21", 100], ["1", "11", 60]]);
});
test("zero matches and zero total weight produce no fake recommendations", () => {
  assert.deepEqual(rankProducts([base], [rule("vendor", "equals", "Unknown")], 3), []);
  assert.deepEqual(rankProducts([base], [], 3), []);
  assert.equal(scoreVariant({ ...base, metafields: { "custom.ram": "" } }, [rule("metafield.custom.ram", "less_than", "1")]), 0);
});
test("ties prefer available then lower-priced variants; limit is respected", () => {
  const products = [{ ...base, id: "2", variantId: "21", price: 10, available: false }, base, { ...base, id: "3", variantId: "31", price: 40 }];
  assert.deepEqual(rankProducts(products, [rule("tags", "equals", "Cotton")], 2).map((p) => p.id), ["3", "1"]);
});
test("submitted answers must match current finder/version and active question ownership", () => {
  const trusted = rule("price", "less_than", "100", 4);
  const finder = { id: "finder", version: 3, questions: [{ id: "q", question: "Budget", enabled: true, answers: [trusted] }] };
  const valid = { finderId: "finder", version: 3, answers: [{ questionId: "q", answerId: "price", weight: 1000 }] };
  assert.equal(selectedRules(valid, finder)[0].weight, 4);
  for (const bad of [
    { ...valid, finderId: "other" }, { ...valid, version: 2 }, { ...valid, answers: [] },
    { ...valid, answers: [{ questionId: "foreign", answerId: "price" }] },
    { ...valid, answers: [{ questionId: "q", answerId: "foreign" }] },
    { ...valid, answers: [valid.answers[0], valid.answers[0]] },
  ]) assert.throws(() => selectedRules(bad, finder));
});
const variant = (id, overrides = {}) => ({
  id: "gid://shopify/ProductVariant/" + id, price: "50", title: "Red", availableForSale: true,
  selectedOptions: base.options,
  product: { id: "gid://shopify/Product/" + id, handle: "shirt-" + id, title: "Shirt", vendor: "Brand", productType: "Shirts",
    tags: [], status: "ACTIVE", onlineStoreUrl: "https://shop.myshopify.com/products/shirt-" + id, publishedInContext: true, ...overrides },
});
test("catalog paginates, isolates shops/collections and coalesces identical cache loads", async () => {
  const calls = [];
  const admin = { graphql: async (_query, { variables }) => {
    calls.push(variables);
    return { json: async () => ({ data: { productVariants: {
      nodes: [variant(variables.after ? "2" : "1")],
      pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? "last" : "next" },
    } } }) };
  } };
  const [a, b] = await Promise.all([
    loadFinderCatalog(admin, "one.myshopify.com", "gid://shopify/Collection/123", 1, []),
    loadFinderCatalog(admin, "one.myshopify.com", "gid://shopify/Collection/123", 1, []),
  ]);
  assert.equal(a.length, 2); assert.equal(b.length, 2); assert.equal(calls.length, 2);
  assert.match(calls[0].query, /published_status:published/); assert.doesNotMatch(calls[0].query, /product_status:|status:active/);
  assert.match(calls[0].query, /collection:123/); assert.equal(calls[1].after, "next");
  await loadFinderCatalog(admin, "two.myshopify.com", null, 1, []);
  assert.equal(calls.length, 4); assert.doesNotMatch(calls[2].query, /collection:/);
});
test("private products are filtered and only configured metafield aliases are read", async () => {
  const admin = { graphql: async () => ({ json: async () => ({ data: { productVariants: {
    nodes: [variant("1", { publishedInContext: false }), variant("2", { status: "DRAFT" }),
      variant("3", { mf0: { type: "list.number_integer", value: '["8","16"]' } })],
    pageInfo: { hasNextPage: false, endCursor: "last" },
  } } }) }) };
  const rows = await loadFinderCatalog(admin, "three.myshopify.com", null, 1, [rule("metafield.custom.ram", "equals", "16")]);
  assert.equal(rows.length, 1);
  assert.equal(scoreVariant(rows[0], [rule("metafield.custom.ram", "equals", "16")]), 2);
  assert.throws(() => catalogQuery(['custom.bad") { secret }']));
});
test("incomplete GraphQL responses are rejected, never cached as partial matches", async () => {
  let count = 0;
  const admin = { graphql: async () => { count += 1; return { json: async () => ({ errors: [{ message: "throttled" }] }) }; } };
  await assert.rejects(loadFinderCatalog(admin, "error.myshopify.com", null, 1, []));
  await assert.rejects(loadFinderCatalog(admin, "error.myshopify.com", null, 1, []));
  assert.equal(count, 2);
});