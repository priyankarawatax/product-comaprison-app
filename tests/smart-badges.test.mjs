/* eslint-env node */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateComparisonBadges } from "../theme-src/product-compare/product-compare-smart-badges.js";

const settings = { enabled: true, lowestPrice: true, bestRated: true, mostPopular: true, bestValue: true, maxPerProduct: 2 };
const item = (id, priceAmount, rating) => ({ id: String(id), key: `${id}:${id}`, priceAmount, rating });

test("calculates current-set winners, ties, priority and display limit", () => {
  const products = [item(1, 2000, 4.5), item(2, 3000, 5), item(3, 2000, 4)];
  const badges = calculateComparisonBadges(products, settings, { 1: 5, 2: 20, 3: 1 });
  assert.deepEqual(badges["1:1"], ["lowest_price"]);
  assert.deepEqual(badges["2:2"], ["best_value", "best_rated"]);
  assert.deepEqual(badges["3:3"], ["lowest_price"]);
});

test("recalculates when a winner is removed", () => {
  const products = [item(1, 1000), item(2, 2000), item(3, 3000)];
  assert.deepEqual(calculateComparisonBadges(products, settings, { 1: 3, 2: 2, 3: 1 })["1:1"], ["best_value", "lowest_price"]);
  const next = calculateComparisonBadges(products.slice(1), settings, { 2: 2, 3: 1 });
  assert.deepEqual(next["2:2"], ["best_value", "lowest_price"]);
});

test("skips unavailable metrics and honors global and individual settings", () => {
  const products = [item(1, 1000), item(2, null)];
  assert.deepEqual(calculateComparisonBadges(products, { ...settings, enabled: false }, {})["1:1"], []);
  const badges = calculateComparisonBadges(products, { ...settings, lowestPrice: false, maxPerProduct: 1 }, {});
  assert.deepEqual(badges["1:1"], []);
  assert.deepEqual(badges["2:2"], []);
});

test("does not invent popularity or misleading one-metric Best Value", () => {
  const products = [item(1, 1000), item(2, 2000)];
  const badges = calculateComparisonBadges(products, settings, {});
  assert.deepEqual(badges["1:1"], ["lowest_price"]);
  assert.deepEqual(badges["2:2"], []);
});
test("supports a full 10-product comparison and max-one display", () => {
  const products = Array.from({ length: 10 }, (_, index) => item(index + 1, 1000 + index * 100, 5 - index * 0.1));
  const badges = calculateComparisonBadges(products, { ...settings, maxPerProduct: 1 }, Object.fromEntries(products.map((product, index) => [product.id, 10 - index])));
  assert.equal(Object.keys(badges).length, 10);
  assert.ok(Object.values(badges).every((entries) => entries.length <= 1));
  assert.deepEqual(badges["1:1"], ["best_value"]);
});