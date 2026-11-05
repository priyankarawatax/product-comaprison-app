import assert from "node:assert/strict";
import { test } from "node:test";
import { getSetupStatus } from "../app/setup-status";
const handles = { embed: "app-embed", comparison: "comparison-block" };
const record = (handle: string, target: string, status: string) => ({
  handle,
  target,
  status,
});
const extension = (activations: ReturnType<typeof record>[]) => [
  { type: "theme_app_extension", activations },
];
test("no deployed extensions leave both steps incomplete", () => {
  assert.deepEqual(getSetupStatus([], handles), [false, false]);
});
test("active embed and comparison block complete their own steps", () => {
  assert.deepEqual(
    getSetupStatus(
      extension([
        record("app-embed", "body", "active"),
        record("comparison-block", "section", "active"),
      ]),
      handles,
    ),
    [true, true],
  );
});
test("removing or disabling a block clears its completion", () => {
  assert.deepEqual(
    getSetupStatus(
      extension([
        record("app-embed", "body", "available"),
        record("comparison-block", "section", "unavailable"),
      ]),
      handles,
    ),
    [false, false],
  );
});
test("other blocks and UI extensions never complete comparison setup", () => {
  assert.deepEqual(
    getSetupStatus(
      [
        ...extension([
          record("other", "section", "active"),
          record("comparison-block", "body", "active"),
        ]),
        {
          type: "ui_extension",
          activations: [record("app-embed", "body", "active")],
        },
      ],
      handles,
    ),
    [false, false],
  );
});
test("custom configured filenames are matched exactly", () => {
  assert.deepEqual(
    getSetupStatus(extension([record("compare-embed", "head", "active")]), {
      embed: "compare-embed",
      comparison: "compare-button",
    }),
    [true, false],
  );
});
