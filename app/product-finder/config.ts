export const OPERATORS = ["equals", "contains", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"] as const;
export type FinderAnswer = { id: string; label: string; field: string; operator: string; value: string; weight: number };
export type FinderQuestion = { id: string; templateQuestionId?: string | null; question: string; mappingType?: string | null; fieldKey?: string | null; required?: boolean; selectionMode?: "single" | "multiple"; enabled: boolean; answers: FinderAnswer[] };
export type FinderCollection = { id: string; title: string; imageUrl: string | null; productCount: number | null };
export type FinderProduct = { id: string; title: string; imageUrl: string | null };
export type FinderRuleSet = { id: string; name: string; enabled: boolean; sourceType: "all_products" | "collection" | "vendor" | "product"; collectionId: string | null; collectionTitle: string | null; vendor: string | null; productId: string | null; productTitle: string | null; collections: FinderCollection[]; vendors: string[]; products: FinderProduct[]; questions: FinderQuestion[] };
export type FinderDraft = { version: number; enabled: boolean; title: string; description: string; buttonText: string; buttonPosition: string; showDesktop: boolean; showMobile: boolean; resultHeading: string; recommendationLimit: number; modalBackground: string; modalTextColor: string; modalAccentColor: string; modalBorderRadius: number; modalTitleSize: number; modalQuestionSize: number; buttonBackground: string; buttonTextColor: string; buttonBorderColor: string; buttonFontSize: number; modalPadding: number; answerPadding: number; noMatchHeading: string; noMatchDescription: string; ruleSets: FinderRuleSet[] };
export type FinderValidationResult = { data: FinderDraft; error: null; field: null } | { data: null; error: string; field: string | null };
export function newRuleSet(): FinderRuleSet {
  return {
    id: crypto.randomUUID(),
    name: "Default rule",
    enabled: true,
    sourceType: "all_products",
    collectionId: null,
    collectionTitle: null,
    vendor: null,
    productId: null,
    productTitle: null,
    collections: [],
    vendors: [],
    products: [],
    questions: [{
      id: crypto.randomUUID(),
      templateQuestionId: null,
      question: "What is your preferred price range?",
      mappingType: "price",
      fieldKey: "price",
      required: false,
      selectionMode: "single",
      enabled: true,
      answers: [
        { id: crypto.randomUUID(), label: "Up to 100", field: "price", operator: "less_than_or_equal", value: "100", weight: 10 },
        { id: crypto.randomUUID(), label: "Above 100", field: "price", operator: "greater_than", value: "100", weight: 10 },
      ],
    }],
  };
}
export function defaultFinder(): FinderDraft { return { version: 0, enabled: false, title: "Find the right product", description: "", buttonText: "Find the right product", buttonPosition: "bottom_left", showDesktop: true, showMobile: true, resultHeading: "Recommended for you", recommendationLimit: 10, modalBackground: "#FAF9F6", modalTextColor: "#202020", modalAccentColor: "#B49A82", modalBorderRadius: 20, modalTitleSize: 28, modalQuestionSize: 20, buttonBackground: "#FAF9F6", buttonTextColor: "#202020", buttonBorderColor: "#DDD2C5", buttonFontSize: 15, modalPadding: 34, answerPadding: 16, noMatchHeading: "No matching products found", noMatchDescription: "We couldn't find an exact match based on your selections. But you might like these popular picks instead.", ruleSets: [newRuleSet()] }; }
export function fieldKind(field: string) { return field.startsWith("metafield.") ? "metafield" : field.startsWith("variant_option.") ? "variant_option" : field; }
export function operatorsFor(field: string): readonly string[] { const kind = fieldKind(field); if (kind === "availability" || kind === "collection") return ["equals"]; if (kind === "price") return OPERATORS.filter((operator) => operator !== "contains"); if (kind === "metafield") return OPERATORS; return ["equals", "contains"]; }
class ValidationError extends Error { constructor(message: string, public field: string | null = null) { super(message); } }
export function validateFinder(input: unknown): FinderValidationResult {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("Invalid settings.");
    const raw = input as FinderDraft & { questions?: FinderQuestion[]; sourceType?: string; collectionId?: string | null; collectionTitle?: string | null; vendor?: string | null; productId?: string | null; productTitle?: string | null };
    const fail = (message: string, field: string | null = null): never => { throw new ValidationError(message, field); };
    const text = (value: unknown, max: number, label: string, field: string, optional = false) => { if (typeof value !== "string" || value.trim().length > max || (!optional && !value.trim())) fail(label + " is required and must be at most " + max + " characters.", field); return (value as string).trim(); };
    const bool = (value: unknown, field: string) => { if (typeof value !== "boolean") fail("Invalid toggle value.", field); return value as boolean; };
    const integer = (value: unknown, min: number, max: number, label: string, field: string) => { if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(label + " must be a whole number from " + min + " to " + max + ".", field); return value as number; };
    const color = (value: unknown, label: string, field: string, fallback: string) => { const normalized = value === undefined ? fallback : typeof value === "string" ? value.trim().toUpperCase() : ""; if (!/^#[0-9A-F]{6}$/.test(normalized)) fail(label + " must be a valid color.", field); return normalized; };
    const ids = new Set<string>();
    const id = (value: unknown, field: string) => { const normalized = typeof value === "string" ? value : ""; if (!/^[a-zA-Z0-9-]{1,64}$/.test(normalized) || ids.has(normalized)) fail("Invalid or duplicate rule, question, or answer identifier.", field); ids.add(normalized); return normalized; };
    if (!["bottom_left", "bottom_center", "center_right", "center_left", "top_center"].includes(raw.buttonPosition)) fail("Choose a valid button position.", "buttonPosition");
    const incomingRules = Array.isArray(raw.ruleSets) ? raw.ruleSets : [{ id: crypto.randomUUID(), name: "Default rule", enabled: true, sourceType: raw.sourceType || "all_products", collectionId: raw.collectionId ?? null, collectionTitle: raw.collectionTitle ?? null, vendor: raw.vendor ?? null, productId: raw.productId ?? null, productTitle: raw.productTitle ?? null, collections: [], vendors: [], products: [], questions: Array.isArray(raw.questions) ? raw.questions : [] }];
    if (incomingRules.length > 10) fail("Create up to 10 rule sets.", "ruleSets");
    const data: FinderDraft = { version: integer(raw.version, 0, 2147483646, "Settings version", "version"), enabled: bool(raw.enabled, "enabled"), title: text(raw.title, 160, "Finder title", "title"), description: text(raw.description, 500, "Description", "description", true), buttonText: text(raw.buttonText, 22, "Button text", "buttonText"), buttonPosition: raw.buttonPosition, showDesktop: bool(raw.showDesktop, "showDesktop"), showMobile: bool(raw.showMobile, "showMobile"), resultHeading: text(raw.resultHeading, 160, "Result heading", "resultHeading"), recommendationLimit: integer(raw.recommendationLimit, 1, 10, "Recommendation count", "recommendationLimit"), modalBackground: color(raw.modalBackground, "Modal background", "modalBackground", "#FAF9F6"), modalTextColor: color(raw.modalTextColor, "Modal text color", "modalTextColor", "#202020"), modalAccentColor: color(raw.modalAccentColor, "Modal accent color", "modalAccentColor", "#B49A82"), modalBorderRadius: integer(raw.modalBorderRadius ?? 20, 0, 40, "Modal corner radius", "modalBorderRadius"), modalTitleSize: integer(raw.modalTitleSize ?? 28, 20, 48, "Modal title size", "modalTitleSize"), modalQuestionSize: integer(raw.modalQuestionSize ?? 20, 14, 32, "Question size", "modalQuestionSize"), buttonBackground: color(raw.buttonBackground, "Button background", "buttonBackground", "#FAF9F6"), buttonTextColor: color(raw.buttonTextColor, "Button text color", "buttonTextColor", "#202020"), buttonBorderColor: color(raw.buttonBorderColor, "Button border color", "buttonBorderColor", "#DDD2C5"), buttonFontSize: integer(raw.buttonFontSize ?? 15, 11, 24, "Button font size", "buttonFontSize"), modalPadding: integer(raw.modalPadding ?? 34, 16, 48, "Modal padding", "modalPadding"), answerPadding: integer(raw.answerPadding ?? 16, 8, 32, "Answer padding", "answerPadding"), noMatchHeading: text(raw.noMatchHeading ?? "No matching products found", 160, "No-match heading", "noMatchHeading"), noMatchDescription: text(raw.noMatchDescription ?? "We couldn't find an exact match based on your selections. But you might like these popular picks instead.", 500, "No-match description", "noMatchDescription"), ruleSets: [] };
    const collections = new Set<string>(); const vendors = new Set<string>(); const products = new Set<string>();
    data.ruleSets = incomingRules.map((rule, ruleIndex) => {
      const prefix = "ruleSets." + ruleIndex;
      if (!rule || typeof rule !== "object") fail("Rule " + (ruleIndex + 1) + " is invalid.", prefix);
      if (!["all_products", "collection", "vendor", "product"].includes(rule.sourceType)) fail("Choose all products, a collection, a vendor, or a product.", prefix + ".sourceType");
      const ruleEnabled = rule.enabled === undefined ? true : bool(rule.enabled, prefix + ".enabled");
      if (!Array.isArray(rule.questions) || rule.questions.length > 20) fail("Use up to 20 questions per rule.", prefix + ".questions");
      let collectionId: string | null = null; let vendor: string | null = null; let productId: string | null = null;
      const ruleCollections = (Array.isArray(rule.collections) ? rule.collections : rule.collectionId ? [{ id: rule.collectionId, title: rule.collectionTitle || "", imageUrl: null, productCount: null }] : []).map((item, itemIndex) => {
        const itemPrefix = prefix + ".collections." + itemIndex; const selectedId = typeof item?.id === "string" ? item.id : "";
        if (!/^gid:\/\/shopify\/Collection\/[1-9][0-9]{0,19}$/.test(selectedId)) fail("Select a valid collection.", itemPrefix);
        if (collections.has(selectedId)) fail("Each collection can only be used by one rule.", itemPrefix); collections.add(selectedId);
        return { id: selectedId, title: typeof item.title === "string" ? item.title.trim().slice(0, 255) : "", imageUrl: typeof item.imageUrl === "string" ? item.imageUrl.slice(0, 1000) : null, productCount: typeof item.productCount === "number" && Number.isInteger(item.productCount) && item.productCount >= 0 ? item.productCount : null };
      });
      const ruleVendors = (Array.isArray(rule.vendors) ? rule.vendors : rule.vendor ? [rule.vendor] : []).map((item, itemIndex) => text(item, 255, "Vendor", prefix + ".vendors." + itemIndex));
      const ruleProducts = (Array.isArray(rule.products) ? rule.products : rule.productId ? [{ id: rule.productId, title: rule.productTitle || "", imageUrl: null }] : []).map((item, itemIndex) => {
        const itemPrefix = prefix + ".products." + itemIndex; const selectedId = typeof item?.id === "string" ? item.id : "";
        if (!/^gid:\/\/shopify\/Product\/[1-9][0-9]{0,19}$/.test(selectedId)) fail("Select a valid product.", itemPrefix);
        if (products.has(selectedId)) fail("Each product can only be used by one rule.", itemPrefix); products.add(selectedId);
        return { id: selectedId, title: typeof item.title === "string" ? item.title.trim().slice(0, 255) : "", imageUrl: typeof item.imageUrl === "string" ? item.imageUrl.slice(0, 1000) : null };
      });
      if (rule.sourceType === "collection") { if (!ruleCollections.length) fail("Select at least one collection.", prefix + ".collections"); collectionId = ruleCollections[0].id; }
      else if (rule.sourceType === "vendor") { if (!ruleVendors.length) fail("Add at least one vendor.", prefix + ".vendors"); for (const item of ruleVendors) { const normalized = item.toLowerCase(); if (vendors.has(normalized)) fail("Each vendor can only be used by one rule.", prefix + ".vendors"); vendors.add(normalized); } vendor = ruleVendors[0]; }
      else if (rule.sourceType === "product") { if (!ruleProducts.length) fail("Select at least one product.", prefix + ".products"); productId = ruleProducts[0].id; }
      const questions = rule.questions.map((question, questionIndex) => {
        const qPrefix = prefix + ".questions." + questionIndex;
        if (!question || typeof question !== "object") fail("Invalid question.", qPrefix);
        const enabled = bool(question.enabled, qPrefix + ".enabled");
        if (!Array.isArray(question.answers) || question.answers.length > 20 || (enabled && question.answers.length < 2)) fail("Question " + (questionIndex + 1) + ": active questions need 2–20 answers.", qPrefix + ".answers");
        const templateQuestionId = question.templateQuestionId == null ? null : text(question.templateQuestionId, 64, "Template question ID", qPrefix + ".templateQuestionId");
        const mappingType = question.mappingType == null ? null : text(question.mappingType, 40, "Mapping type", qPrefix + ".mappingType");
        const fieldKey = question.fieldKey == null ? null : text(question.fieldKey, 350, "Shopify field mapping", qPrefix + ".fieldKey");
        const required = question.required === undefined ? false : bool(question.required, qPrefix + ".required");
        const selectionMode: FinderQuestion["selectionMode"] = question.selectionMode === "multiple" ? "multiple" : "single";
        return { id: id(question.id, qPrefix + ".id"), templateQuestionId, question: text(question.question, 250, "Question " + (questionIndex + 1), qPrefix + ".question"), mappingType, fieldKey, required, selectionMode, enabled, answers: question.answers.map((answer, answerIndex) => {
          const aPrefix = qPrefix + ".answers." + answerIndex; if (!answer || typeof answer !== "object") fail("Invalid answer.", aPrefix);
          const answerLabel = "Question " + (questionIndex + 1) + ", answer " + (answerIndex + 1); const field = text(answer.field, 350, answerLabel + " field", aPrefix + ".field"); const kind = fieldKind(field);
          if (!["price", "vendor", "product_type", "tags", "availability", "variant_option", "metafield", "collection"].includes(kind)) fail(answerLabel + ": choose a supported field.", aPrefix + ".field");
          if (kind === "metafield" && !/^metafield\.[A-Za-z0-9_-]{3,255}\.[A-Za-z0-9_-]{3,64}$/.test(field)) fail(answerLabel + ": enter namespace.key, for example custom.material.", aPrefix + ".field");
          if (kind === "variant_option" && !/^variant_option\..{1,100}$/.test(field)) fail(answerLabel + ": enter the variant option name, for example Color.", aPrefix + ".field");
          if (!operatorsFor(field).includes(answer.operator)) fail(answerLabel + ": operator is not supported for this field.", aPrefix + ".operator");
          const value = text(answer.value, 500, answerLabel + " match value", aPrefix + ".value"); if (kind === "availability" && !["true", "false"].includes(value)) fail(answerLabel + ": choose an availability value.", aPrefix + ".value");
          const numeric = kind === "price" || !["equals", "contains"].includes(answer.operator); if (numeric && (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || (kind === "price" && Number(value) < 0))) fail(answerLabel + ": enter a valid numeric match value.", aPrefix + ".value");
          return { id: id(answer.id, aPrefix + ".id"), label: text(answer.label, 160, answerLabel + " label", aPrefix + ".label"), field, operator: answer.operator, value, weight: integer(answer.weight, 1, 100, answerLabel + " weight", aPrefix + ".weight") };
        }) };
      });
      if (data.enabled && ruleEnabled && !questions.some((question) => question.enabled)) fail("Rule " + (ruleIndex + 1) + " needs at least one active question.", prefix + ".questions");
      if (data.enabled) {
        const unresolved = questions.find((question) => question.required && (!question.enabled || !question.fieldKey || question.answers.length < 2));
        if (unresolved) fail(`Required Shopify mapping is unresolved for "${unresolved.question}". Configure at least two real values before publishing.`, prefix + ".questions." + questions.indexOf(unresolved));
      }
      return { id: id(rule.id, prefix + ".id"), name: text(rule.name, 100, "Rule " + (ruleIndex + 1) + " name", prefix + ".name"), enabled: ruleEnabled, sourceType: rule.sourceType as FinderRuleSet["sourceType"], collectionId, collectionTitle: rule.sourceType === "collection" && typeof rule.collectionTitle === "string" ? rule.collectionTitle.trim().slice(0, 255) || null : null, vendor, productId, productTitle: ruleProducts[0]?.title || null, collections: ruleCollections, vendors: ruleVendors, products: ruleProducts, questions };
    });
    if (data.enabled && !data.showDesktop && !data.showMobile) fail("Enable desktop or mobile before enabling Product Finder.", "showDesktop");
    return { data, error: null, field: null };
  } catch (error) { return { data: null, error: error instanceof Error ? error.message : "Invalid settings.", field: error instanceof ValidationError ? error.field : null }; }
}
