import { newRuleSet, type FinderAnswer, type FinderQuestion, type FinderRuleSet } from "./config";

export const PRODUCT_FINDER_TEMPLATE_IDS = [
  "quick-product-finder",
  "fashion-style-finder",
  "gift-finder",
  "feature-specification-finder",
  "collection-budget-finder",
  "custom-product-finder",
] as const;

export type ProductFinderTemplateId = typeof PRODUCT_FINDER_TEMPLATE_IDS[number];
export type ProductFinderMappingType = "product_type" | "price" | "vendor" | "availability" | "variant_option" | "tags" | "metafield" | "collection";
export type CatalogCollection = { id: string; title: string };
export type CatalogMetafield = { id: string; key: string; name: string; type: string; values: string[] };
export type FinderTemplateCatalog = {
  currencyCode: string;
  productTypes: string[];
  vendors: string[];
  collections: CatalogCollection[];
  prices: number[];
  availability: { available: boolean; soldOut: boolean };
  options: Record<string, string[]>;
  tags: string[];
  metafields: CatalogMetafield[];
  warnings: string[];
};

export type TemplateQuestionDefinition = {
  id: string;
  label: string;
  mappingType: ProductFinderMappingType;
  required: boolean;
  preferredFieldKey?: string;
  answerConfiguration: { editable: true; allowAdd: true; allowRemove: true; minimumAnswers: 2; maximumAnswers: 20 };
  editableAnswerConfiguration: {
    allowAdd: true;
    allowRemove: true;
    allowReorder: true;
    minimumAnswers: 2;
    maximumAnswers: 20;
  };
};

export type ProductFinderTemplate = {
  id: ProductFinderTemplateId;
  name: string;
  description: string;
  icon: "product" | "edit" | "enabled" | "duplicate" | "collection";
  questions: readonly TemplateQuestionDefinition[];
};

const answerConfiguration: TemplateQuestionDefinition["editableAnswerConfiguration"] = {
  allowAdd: true,
  allowRemove: true,
  allowReorder: true,
  minimumAnswers: 2,
  maximumAnswers: 20,
};

const question = (id: string, label: string, mappingType: ProductFinderMappingType, required: boolean, preferredFieldKey?: string): TemplateQuestionDefinition => ({
  id, label, mappingType, required, preferredFieldKey, answerConfiguration: { editable: true, allowAdd: true, allowRemove: true, minimumAnswers: 2, maximumAnswers: 20 }, editableAnswerConfiguration: answerConfiguration,
});

export const PRODUCT_FINDER_TEMPLATES: readonly ProductFinderTemplate[] = [
  { id: "quick-product-finder", name: "Quick Product Finder", description: "A fast starting point using common product attributes.", icon: "enabled", questions: [
    question("quick-product-type", "Product Type", "product_type", true),
    question("quick-price-range", "Price Range", "price", true),
    question("quick-vendor", "Vendor", "vendor", false),
    question("quick-availability", "Availability", "availability", false),
  ] },
  { id: "fashion-style-finder", name: "Fashion & Style Finder", description: "Guide shoppers by product type, size, color, and budget.", icon: "edit", questions: [
    question("fashion-product-type", "Product Type", "product_type", true),
    question("fashion-size", "Size", "variant_option", true, "Size"),
    question("fashion-color", "Color", "variant_option", false, "Color"),
    question("fashion-price-range", "Price Range", "price", false),
  ] },
  { id: "gift-finder", name: "Gift Finder", description: "Help shoppers narrow gifts by occasion, recipient, type, and price.", icon: "duplicate", questions: [
    question("gift-occasion", "Occasion", "tags", true),
    question("gift-recipient", "Recipient", "tags", false),
    question("gift-product-type", "Product Type", "product_type", false),
    question("gift-price-range", "Price Range", "price", false),
  ] },
  { id: "feature-specification-finder", name: "Feature & Specification Finder", description: "Match products by type, brand, a feature metafield, and price.", icon: "product", questions: [
    question("feature-product-type", "Product Type", "product_type", true),
    question("feature-vendor", "Vendor", "vendor", false),
    question("feature-metafield", "Feature Metafield", "metafield", true),
    question("feature-price-range", "Price Range", "price", false),
  ] },
  { id: "collection-budget-finder", name: "Collection & Budget Finder", description: "Start with collection intent, then refine by type, vendor, and price.", icon: "collection", questions: [
    question("collection-selection", "Collection", "collection", true),
    question("collection-product-type", "Product Type", "product_type", false),
    question("collection-vendor", "Vendor", "vendor", false),
    question("collection-price-range", "Price Range", "price", true),
  ] },
  { id: "custom-product-finder", name: "Custom Product Finder", description: "Create an empty rule and build every question yourself.", icon: "edit", questions: [] },
] as const;

const templateIds = new Set<string>(PRODUCT_FINDER_TEMPLATE_IDS);
export function isProductFinderTemplateId(value: string | null | undefined): value is ProductFinderTemplateId {
  return typeof value === "string" && templateIds.has(value);
}
export function getProductFinderTemplate(value: string | null | undefined): ProductFinderTemplate {
  const id: ProductFinderTemplateId = isProductFinderTemplateId(value) ? value : "custom-product-finder";
  return PRODUCT_FINDER_TEMPLATES.find((template) => template.id === id)!;
}

const DEFAULT_TEMPLATE_ANSWER_SUGGESTIONS = 5;
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, DEFAULT_TEMPLATE_ANSWER_SUGGESTIONS);
const answers = (field: string, values: string[], operator = "equals"): FinderAnswer[] => unique(values).map((value) => ({
  id: crypto.randomUUID(), label: value, field, operator, value, weight: 10,
}));
function priceAnswers(catalog: FinderTemplateCatalog): FinderAnswer[] {
  const prices = [...new Set(catalog.prices.filter((price) => Number.isFinite(price) && price >= 0))].sort((a, b) => a - b);
  if (prices.length < 2) return [];
  const boundary = prices[Math.floor((prices.length - 1) / 2)];
  const formatted = new Intl.NumberFormat(undefined, { style: "currency", currency: catalog.currencyCode }).format(boundary);
  return [
    { id: crypto.randomUUID(), label: "Up to " + formatted, field: "price", operator: "less_than_or_equal", value: String(boundary), weight: 10 },
    { id: crypto.randomUUID(), label: "Above " + formatted, field: "price", operator: "greater_than", value: String(boundary), weight: 10 },
  ];
}
function availabilityAnswers(catalog: FinderTemplateCatalog): FinderAnswer[] {
  const result: FinderAnswer[] = [];
  if (catalog.availability.available) result.push({ id: crypto.randomUUID(), label: "Yes", field: "availability", operator: "equals", value: "true", weight: 10 });
  if (catalog.availability.soldOut) result.push({ id: crypto.randomUUID(), label: "No", field: "availability", operator: "equals", value: "false", weight: 10 });
  return result;
}
function optionName(catalog: FinderTemplateCatalog, preferred?: string) {
  const names = Object.keys(catalog.options);
  return names.find((name) => preferred && name.toLowerCase() === preferred.toLowerCase()) || names[0] || null;
}
function definitionMapping(definition: TemplateQuestionDefinition, catalog: FinderTemplateCatalog): { mappingType: string; fieldKey: string | null; answers: FinderAnswer[] } {
  if (definition.mappingType === "product_type") return { mappingType: "product_type", fieldKey: "product_type", answers: answers("product_type", catalog.productTypes) };
  if (definition.mappingType === "vendor") return { mappingType: "vendor", fieldKey: "vendor", answers: answers("vendor", catalog.vendors) };
  if (definition.mappingType === "price") return { mappingType: "price", fieldKey: "price", answers: priceAnswers(catalog) };
  if (definition.mappingType === "availability") return { mappingType: "availability", fieldKey: "availability", answers: availabilityAnswers(catalog) };
  if (definition.mappingType === "collection") return { mappingType: "collection", fieldKey: "collection", answers: catalog.collections.slice(0, DEFAULT_TEMPLATE_ANSWER_SUGGESTIONS).map((item) => ({ id: crypto.randomUUID(), label: item.title, field: "collection", operator: "equals", value: item.id, weight: 10 })) };
  if (definition.mappingType === "variant_option") {
    const name = optionName(catalog, definition.preferredFieldKey);
    return { mappingType: "variant_option", fieldKey: name ? "variant_option." + name : null, answers: name ? answers("variant_option." + name, catalog.options[name]) : [] };
  }
  if (definition.mappingType === "metafield") {
    const metafield = catalog.metafields.find((item) => item.values.length >= 2) || null;
    return { mappingType: "metafield", fieldKey: metafield ? "metafield." + metafield.key : null, answers: metafield ? answers("metafield." + metafield.key, metafield.values) : [] };
  }
  return { mappingType: "tags", fieldKey: "tags", answers: answers("tags", catalog.tags, "contains") };
}
function instantiateQuestion(definition: TemplateQuestionDefinition, catalog: FinderTemplateCatalog): FinderQuestion {
  const mapping = definitionMapping(definition, catalog);
  const resolved = Boolean(mapping.fieldKey) && mapping.answers.length >= 2;
  return {
    id: crypto.randomUUID(),
    templateQuestionId: definition.id,
    question: definition.label,
    mappingType: mapping.mappingType,
    fieldKey: mapping.fieldKey,
    required: definition.required,
    selectionMode: "single",
    enabled: definition.required ? resolved : false,
    answers: mapping.answers,
  };
}

export function createRuleFromTemplate(templateId: string | null | undefined, catalog?: FinderTemplateCatalog | null): FinderRuleSet {
  const template = getProductFinderTemplate(templateId);
  const base = newRuleSet();
  return {
    ...base,
    name: template.name,
    questions: template.id === "custom-product-finder" ? [] : catalog ? template.questions.map((definition) => instantiateQuestion(definition, catalog)) : template.questions.map((definition) => ({
      id: crypto.randomUUID(),
      templateQuestionId: definition.id,
      question: definition.label,
      mappingType: definition.mappingType,
      fieldKey: null,
      required: definition.required,
      selectionMode: "single",
      enabled: definition.required,
      answers: [0, 1].map(() => ({ id: crypto.randomUUID(), label: "", field: definition.mappingType, operator: "equals", value: "", weight: 10 })),
    })),
  };
}

export function catalogValuesForField(catalog: FinderTemplateCatalog, fieldKey: string): string[] {
  if (fieldKey === "product_type") return catalog.productTypes;
  if (fieldKey === "vendor") return catalog.vendors;
  if (fieldKey === "tags") return catalog.tags;
  if (fieldKey.startsWith("variant_option.")) return catalog.options[fieldKey.slice(15)] || [];
  if (fieldKey.startsWith("metafield.")) return catalog.metafields.find((item) => item.key === fieldKey.slice(10))?.values || [];
  return [];
}

export function createCatalogAnswers(catalog: FinderTemplateCatalog, mappingType: ProductFinderMappingType, fieldKey: string): FinderAnswer[] {
  if (mappingType === "price") return priceAnswers(catalog);
  if (mappingType === "availability") return availabilityAnswers(catalog);
  if (mappingType === "collection") return catalog.collections.slice(0, DEFAULT_TEMPLATE_ANSWER_SUGGESTIONS).map((item) => ({ id: crypto.randomUUID(), label: item.title, field: "collection", operator: "equals", value: item.id, weight: 10 }));
  return answers(fieldKey, catalogValuesForField(catalog, fieldKey), mappingType === "tags" ? "contains" : "equals");
}
