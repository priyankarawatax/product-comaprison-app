/* global globalThis */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement, useState, act } from "react";
import { createRoot } from "react-dom/client";
import { SmartBadgeOption } from "../app/components/smart-badge-option.tsx";

test("Smart Badge label opens in a 40-character rename field and saves", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.getElementById("root"));
  function Harness() {
    const [settings, setSettings] = useState({ enabled: true, lowestPrice: true, bestRated: true, mostPopular: true, bestValue: true, lowestPriceLabel: "Lowest Price", bestRatedLabel: "Best Rated", mostPopularLabel: "Most Popular", bestValueLabel: "Best Value" });
    return createElement(SmartBadgeOption, { badgeKey: "lowestPrice", labelKey: "lowestPriceLabel", settings, saving: false, onChange: (patch) => setSettings((value) => ({ ...value, ...patch })) });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    const rename = document.querySelector('s-button[accessibilitylabel="Rename Lowest Price"]');
    await act(async () => rename.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    const input = document.querySelector("s-text-field");
    assert.equal(input.getAttribute("value"), "Lowest Price");
    assert.equal(input.getAttribute("maxlength"), "40");
    await act(async () => { input.value = "Budget Pick"; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    const save = [...document.querySelectorAll("s-button")].find((button) => button.textContent === "Save");
    await act(async () => save.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(document.querySelector("s-text-field"), null);
    assert.equal(document.querySelector("s-checkbox").getAttribute("label"), "Budget Pick");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});
