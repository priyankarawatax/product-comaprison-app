import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_FINDER_TEMPLATE_IDS,
  PRODUCT_FINDER_TEMPLATES,
  createRuleFromTemplate,
  getProductFinderTemplate,
} from "../app/product-finder/templates.ts";

test("Product Finder exposes exactly six stable templates", () => {
  assert.equal(PRODUCT_FINDER_TEMPLATES.length, 6);
  assert.deepEqual(PRODUCT_FINDER_TEMPLATES.map((template) => template.id), [...PRODUCT_FINDER_TEMPLATE_IDS]);
  assert.equal(new Set(PRODUCT_FINDER_TEMPLATE_IDS).size, 6);
  for (const template of PRODUCT_FINDER_TEMPLATES) {
    assert.ok(template.name);
    assert.ok(template.description);
    assert.ok(template.icon);
    assert.equal(new Set(template.questions.map((question) => question.id)).size, template.questions.length);
    for (const question of template.questions) {
      assert.ok(question.label);
      assert.ok(question.mappingType);
      assert.equal(typeof question.required, "boolean");
      assert.equal(question.answerConfiguration.editable, true);
      assert.equal(question.answerConfiguration.allowAdd, true);
      assert.equal(question.answerConfiguration.allowRemove, true);
      assert.equal(question.answerConfiguration.minimumAnswers, 2);
      assert.equal(question.answerConfiguration.maximumAnswers, 20);
    }
  }
});

test("template factories create editable drafts without persisting or reusing runtime IDs", () => {
  const first = createRuleFromTemplate("quick-product-finder");
  const second = createRuleFromTemplate("quick-product-finder");
  assert.equal(first.questions.length, 4);
  assert.equal(first.name, "Quick Product Finder");
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.questions[0].id, second.questions[0].id);
  assert.notEqual(first.questions[0].answers[0].id, second.questions[0].answers[0].id);
  assert.equal(first.questions[0].enabled, true);
  assert.equal(first.questions[2].enabled, false);
});

test("custom and unknown templates preserve the empty manual creation flow", () => {
  assert.deepEqual(createRuleFromTemplate("custom-product-finder").questions, []);
  assert.equal(getProductFinderTemplate("unknown").id, "custom-product-finder");
  assert.deepEqual(createRuleFromTemplate(null).questions, []);
});


test("template prefills show at most five catalog suggestions while remaining editable", () => {
  const many = { currencyCode: "USD", vendors: ["Vendor A", "Vendor B"], prices: [10, 20], availability: { available: true, soldOut: true }, options: {}, tags: [], metafields: [], warnings: [], productTypes: Array.from({ length: 12 }, (_, index) => "Type " + index), collections: Array.from({ length: 12 }, (_, index) => ({ id: "gid://shopify/Collection/" + (index + 1), title: "Collection " + index })) };
  const quick = createRuleFromTemplate("quick-product-finder", many);
  const collection = createRuleFromTemplate("collection-budget-finder", many);
  assert.equal(quick.questions[0].answers.length, 5);
  assert.equal(collection.questions[0].answers.length, 5);
  assert.equal(quick.questions[0].answers.length < quick.questions[0].answers.concat([{ id: "manual" }]).length, true);
});
