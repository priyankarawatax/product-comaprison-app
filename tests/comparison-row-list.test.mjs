/* global globalThis */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createElement, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ComparisonRowList } from '../app/components/comparison-row-list.tsx';
import { DEFAULT_ROW_ORDER } from '../app/comparison-rows.ts';

test('row handles reorder with pointers and keyboard, and Escape restores a drag', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.getElementById('root'));
  function Harness() {
    const [order, setOrder] = useState([...DEFAULT_ROW_ORDER]);
    return createElement(ComparisonRowList, { order, disabledRows: [], saving: false, onOrderChange: setOrder, onDisabledChange: () => {} });
  }
  const nodes = () => [...document.querySelectorAll('[data-row-id]')];
  const order = () => nodes().map(node => node.dataset.rowId);
  const handle = id => document.querySelector(`[data-row-id="${id}"] [role="button"]`);
  async function pointer(target, type, y) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => target.dispatchEvent(event));
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    for (const node of nodes()) node.getBoundingClientRect = () => {
      const top = nodes().indexOf(node) * 100;
      return { top, bottom: top + 100, height: 100 };
    };
    const [first, second, third] = DEFAULT_ROW_ORDER;
    await pointer(handle(first), 'pointerdown', 50);
    await pointer(document, 'pointermove', 260);
    await pointer(document, 'pointerup', 260);
    assert.deepEqual(order().slice(0, 3), [second, third, first]);
    await pointer(handle(first), 'pointerdown', 250);
    await pointer(document, 'pointermove', 20);
    assert.equal(order()[0], first);
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.deepEqual(order().slice(0, 3), [second, third, first]);
    await act(async () => handle(first).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    assert.deepEqual(order().slice(0, 3), [second, first, third]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('row labels keep their display until Rename is clicked, then save the edited label', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.getElementById('root'));
  function Harness() {
    const [labels, setLabels] = useState({ price: 'Price' });
    return createElement(ComparisonRowList, { order: ['price'], disabledRows: [], labels, saving: false, onOrderChange: () => {}, onDisabledChange: () => {}, onLabelChange: (id, label) => setLabels((value) => ({ ...value, [id]: label })) });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    assert.equal(document.querySelector('s-text-field'), null);
    const rename = document.querySelector('s-button[accessibilitylabel="Rename Price"]');
    await act(async () => rename.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    const input = document.querySelector('s-text-field');
    assert.equal(input.getAttribute('value'), 'Price');
    assert.equal(input.getAttribute('maxlength'), '40');
    assert.equal(input.getAttribute('labelaccessibilityvisibility'), 'exclusive');
    await act(async () => { input.value = 'Our price'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(document.querySelector('s-text-field').value, 'Our price');
    const save = [...document.querySelectorAll('s-button')].find((button) => button.textContent === 'Save');
    await act(async () => save.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(document.querySelector('s-text-field'), null);
    assert.match(document.querySelector('[data-row-id="price"]').textContent, /Our price/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
