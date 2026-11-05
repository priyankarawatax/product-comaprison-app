import test from "node:test";
import assert from "node:assert/strict";
import { selectedRules, rankMatchingProducts } from "../app/product-finder/scoring.ts";

const answer = (id, field, operator, value) => ({ id, label: id, field, operator, value, weight: 10 });
const variant = (overrides = {}) => ({ id: "1", variantId: "11", handle: "shirt", title: "Shirt", price: 50, available: true, vendor: "Acme", productType: "Shirt", tags: ["Birthday"], options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "M" }], metafields: { "custom.feature": "Waterproof", "custom.recipient": "Parent" }, ...overrides });
const group = (questionId, ...answers) => ({ questionId, answers });

test("strict Product Type and Price matching uses AND", () => {
  const selections = [group("type", answer("shirt", "product_type", "equals", "Shirt")), group("price", answer("budget", "price", "less_than_or_equal", "60"))];
  assert.equal(rankMatchingProducts([variant(), variant({ id: "2", variantId: "21", price: 80 })], selections, 0, 10).totalCount, 1);
});
test("Vendor and Availability must both match", () => {
  const selections = [group("vendor", answer("acme", "vendor", "equals", "Acme")), group("stock", answer("yes", "availability", "equals", "true"))];
  assert.deepEqual(rankMatchingProducts([variant(), variant({ id: "2", variantId: "21", available: false })], selections, 0, 10).products.map((p) => p.id), ["1"]);
});
test("Color Size and Price must match the same variant", () => {
  const selections = [group("color", answer("blue", "variant_option.Color", "equals", "Blue")), group("size", answer("m", "variant_option.Size", "equals", "M")), group("price", answer("cheap", "price", "less_than_or_equal", "60"))];
  const splitAcrossVariants = [variant({ options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "L" }] }), variant({ variantId: "12", price: 80, options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "M" }] })];
  assert.equal(rankMatchingProducts(splitAcrossVariants, selections, 0, 10).totalCount, 0);
});
test("multiple answers in one question use OR while questions use AND", () => {
  const questions = [{ id: "vendor", question: "Brand", enabled: true, selectionMode: "multiple", answers: [answer("a", "vendor", "equals", "Acme"), answer("b", "vendor", "equals", "Other")] }, { id: "tag", question: "Occasion", enabled: true, answers: [answer("birthday", "tags", "equals", "Birthday")] }];
  const selections = selectedRules({ finderId: "f", version: 1, answers: [{ questionId: "vendor", answerIds: ["a", "b"] }, { questionId: "tag", answerId: "birthday" }] }, { id: "f", version: 1, questions });
  assert.equal(rankMatchingProducts([variant()], selections, 0, 10).totalCount, 1);
});
test("tag and typed metafield values match actual candidate data", () => {
  const selections = [group("occasion", answer("birthday", "tags", "equals", "Birthday")), group("feature", answer("waterproof", "metafield.custom.feature", "equals", "Waterproof"))];
  assert.equal(rankMatchingProducts([variant(), variant({ id: "2", variantId: "21", metafields: {} })], selections, 0, 10).totalCount, 1);
});
test("result pagination is exact and legacy single-answer payload remains valid", () => {
  const q = { id: "q", question: "Type", enabled: true, answers: [answer("shirt", "product_type", "equals", "Shirt")] };
  const selections = selectedRules({ finderId: "f", version: 1, answers: [{ questionId: "q", answerId: "shirt" }] }, { id: "f", version: 1, questions: [q] });
  const candidates = [variant(), variant({ id: "2", variantId: "21" }), variant({ id: "3", variantId: "31" })];
  const page = rankMatchingProducts(candidates, selections, 1, 1);
  assert.equal(page.totalCount, 3); assert.equal(page.products.length, 1); assert.equal(page.hasMore, true);
});
