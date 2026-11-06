import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("analytics empty state has no orphan currency text", () => {
  const source = readFileSync(
    new URL("../app/routes/app.analytics.tsx", import.meta.url),
    "utf8",
  );
  const emptyState = source.match(
    /<s-empty-state[\s\S]*?<\/s-empty-state>/,
  )?.[0];

  assert.ok(emptyState, "analytics empty state should exist");
  assert.match(emptyState, /heading="No comparison activity yet"/);
  assert.doesNotMatch(emptyState, />\s*\$\s*</);
});
