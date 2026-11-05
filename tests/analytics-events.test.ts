import test from "node:test";
import assert from "node:assert/strict";
import { parseAnalyticsEvent } from "../app/analytics/events";

const base = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  sessionId: "123e4567-e89b-42d3-a456-426614174001",
};

test("Product Finder open analytics does not require a product ID", () => {
  const event = parseAnalyticsEvent({
    ...base,
    eventType: "product_finder_opened",
    source: "product_finder",
  });
  assert.ok(event);
  assert.equal(event.eventType, "product_finder_opened");
  assert.equal(event.productId, null);
  assert.deepEqual(event.metadata, { source: "product_finder" });
});

test("unknown product-less analytics events remain invalid", () => {
  assert.equal(parseAnalyticsEvent({ ...base, eventType: "unknown_event" }), null);
  assert.equal(parseAnalyticsEvent({ ...base, eventType: "product_viewed" }), null);
});