import assert from "node:assert/strict";
import test from "node:test";
import { defaultWishlistSettings, validateWishlistSettings } from "../app/wishlist/config";

test("Wishlist is disabled by default with safe storefront defaults", () => {
  assert.equal(defaultWishlistSettings.enabled, false);
  assert.equal(defaultWishlistSettings.page.layout, "grid");
  assert.equal(validateWishlistSettings(structuredClone(defaultWishlistSettings)).data?.enabled, false);
});

test("Wishlist validation rejects unsafe colors, ranges, enums, and labels", () => {
  const color = structuredClone(defaultWishlistSettings); color.button.activeIconColor = "red<script>";
  assert.match(validateWishlistSettings(color).error || "", /Colors/);
  const size = structuredClone(defaultWishlistSettings); size.button.iconSize = 100;
  assert.match(validateWishlistSettings(size).error || "", /sizing/);
  const layout = structuredClone(defaultWishlistSettings); (layout.page as { layout: string }).layout = "html";
  assert.match(validateWishlistSettings(layout).error || "", /page settings/);
  const label = structuredClone(defaultWishlistSettings); label.text.addToCart = "";
  assert.match(validateWishlistSettings(label).error || "", /Text labels/);
});
