import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROW_ORDER, isRowOrder, readRowOrder, isDisabledRows, readDisabledRows, moveRow, isRowLabels, readRowLabels } from "../app/comparison-rows";

test("row order accepts a full permutation and rejects missing, duplicate or unknown fields", () => {
  assert.equal(DEFAULT_ROW_ORDER.at(-1), "description");
  assert.ok(isRowOrder([...DEFAULT_ROW_ORDER].reverse()));
  assert.equal(isRowOrder(DEFAULT_ROW_ORDER.slice(1)), false);
  assert.equal(isRowOrder(DEFAULT_ROW_ORDER.map(() => "price")), false);
  assert.equal(isRowOrder([...DEFAULT_ROW_ORDER.slice(1), "unknown"]), false);
  assert.deepEqual(readRowOrder("broken json"), DEFAULT_ROW_ORDER);
  const reversedDescriptionLast: string[] = [...DEFAULT_ROW_ORDER].reverse().filter((id) => id !== "description");
  reversedDescriptionLast.push("description");
  assert.deepEqual(readRowOrder(JSON.stringify([...DEFAULT_ROW_ORDER].reverse())), reversedDescriptionLast);
  assert.deepEqual(readRowOrder(JSON.stringify(DEFAULT_ROW_ORDER.filter((id) => id !== "soldCount"))), DEFAULT_ROW_ORDER);
});

test("row labels accept safe overrides and fall back to defaults", () => {
  assert.ok(isRowLabels({ price: "Our price", soldCount: "Purchased" }));
  assert.equal(isRowLabels({ unknown: "Unknown" }), false);
  assert.equal(isRowLabels({ price: "" }), false);
  assert.equal(isRowLabels({ price: "x".repeat(41) }), false);
  const labels = readRowLabels(JSON.stringify({ price: " Our price " }));
  assert.equal(labels.price, "Our price");
  assert.equal(labels.variantTitle, "Variant");
  assert.equal(labels.soldCount, "Total sold");
  assert.equal(labels.rating, "Customer rating");
  assert.equal(labels.reviewCount, "Reviews");
});

test("drag reorder preserves all rows and ignores unknown targets", () => {
  const order = [...DEFAULT_ROW_ORDER];
  const moved = moveRow(order, "description", "price");
  assert.equal(moved[1], "description");
  assert.ok(isRowOrder(moved));
  assert.deepEqual(order, DEFAULT_ROW_ORDER);
  assert.deepEqual(moveRow(order, "unknown", "price"), order);
});

test("disabled rows allow none, a subset or all known rows", () => {
  assert.ok(isDisabledRows([]));
  assert.ok(isDisabledRows(["sku", "vendor"]));
  assert.ok(isDisabledRows(DEFAULT_ROW_ORDER));
  assert.equal(isDisabledRows(["sku", "sku"]), false);
  assert.equal(isDisabledRows(["unknown"]), false);
  assert.deepEqual(readDisabledRows(null), []);
  assert.deepEqual(readDisabledRows('true'), []);
});
