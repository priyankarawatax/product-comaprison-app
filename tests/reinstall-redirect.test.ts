import { test } from "node:test";
import assert from "node:assert/strict";
import { billingSelectionRedirectUrl } from "../app/billing/reinstall-redirect";

test("reinstall billing redirect preserves Shopify authentication parameters", () => {
  const destination = billingSelectionRedirectUrl(
    "https://example.test/app?shop=priyanka-staging.myshopify.com&host=encoded-host&embedded=1&id_token=signed-token&locale=en",
  );
  const url = new URL(destination, "https://example.test");

  assert.equal(url.pathname, "/app/billing");
  assert.equal(url.searchParams.get("reinstall"), "1");
  assert.equal(url.searchParams.get("shop"), "priyanka-staging.myshopify.com");
  assert.equal(url.searchParams.get("host"), "encoded-host");
  assert.equal(url.searchParams.get("embedded"), "1");
  assert.equal(url.searchParams.get("id_token"), "signed-token");
  assert.equal(url.searchParams.get("locale"), "en");
});
