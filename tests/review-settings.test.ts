import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REVIEW_SETTINGS, isReviewSettings, readReviewSettings } from "../app/review-settings";

test("review settings support standard, automatic fallback, and valid custom mappings", () => {
  assert.ok(isReviewSettings(DEFAULT_REVIEW_SETTINGS));
  assert.equal(DEFAULT_REVIEW_SETTINGS.source, "standard");
  assert.ok(isReviewSettings({ source: "standard", ratingNamespace: "", ratingKey: "", countNamespace: "", countKey: "", maxScale: 5 }));
  assert.ok(isReviewSettings({ source: "custom", ratingNamespace: "loox", ratingKey: "avg_rating", countNamespace: "loox", countKey: "num_reviews", maxScale: 5 }));
  assert.equal(isReviewSettings({ source: "custom", ratingNamespace: "", ratingKey: "", countNamespace: "", countKey: "", maxScale: 5 }), false);
  assert.equal(isReviewSettings({ ...DEFAULT_REVIEW_SETTINGS, maxScale: 11 }), false);
  assert.deepEqual(readReviewSettings("broken"), DEFAULT_REVIEW_SETTINGS);
});
