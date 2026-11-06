import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("document responses prevent proxy transformations", () => {
  const source = readFileSync(
    new URL("../app/entry.server.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /responseHeaders\.set\(\s*["']Cache-Control["']\s*,\s*["']private, no-store, no-transform["']\s*\)/,
  );
});
