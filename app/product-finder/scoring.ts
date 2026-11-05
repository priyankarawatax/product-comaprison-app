import type { FinderAnswer, FinderQuestion } from "./config";

export type Candidate = {
  id: string; variantId: string; handle: string; title: string;
  price: number; currencyCode?: string; available: boolean; vendor: string; productType: string; tags: string[];
  options: { name: string; value: string }[];
  metafields: Record<string, unknown>;
};
export type SelectedQuestion = { questionId: string; answers: FinderAnswer[] } & Partial<FinderAnswer>;
export class FinderRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function selectedRules(input: unknown, finder: { id: string; version: number; questions: FinderQuestion[] }): SelectedQuestion[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FinderRequestError("Choose an answer for every question.");
  const data = input as { finderId?: unknown; version?: unknown; answers?: unknown };
  if (data.finderId !== finder.id || data.version !== finder.version) throw new FinderRequestError("This quiz has changed. Refresh the page to start the latest quiz.", 409);
  const questions = finder.questions.filter((question) => question.enabled);
  if (!questions.length || !Array.isArray(data.answers) || data.answers.length !== questions.length) throw new FinderRequestError("Choose an answer for every question.");
  const selections = new Map<string, string[]>();
  for (const entry of data.answers) {
    if (!entry || typeof entry !== "object" || typeof (entry as { questionId?: unknown }).questionId !== "string") throw new FinderRequestError("Invalid quiz answers.");
    const value = entry as { questionId: string; answerId?: unknown; answerIds?: unknown };
    if (selections.has(value.questionId)) throw new FinderRequestError("Invalid quiz answers.");
    const ids = Array.isArray(value.answerIds) ? value.answerIds : typeof value.answerId === "string" ? [value.answerId] : [];
    if (!ids.length || ids.length > 20 || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) throw new FinderRequestError("Choose at least one valid answer.");
    selections.set(value.questionId, ids as string[]);
  }
  return questions.map((question) => {
    const ids = selections.get(question.id);
    if (!ids) throw new FinderRequestError("Choose an answer for every question.");
    const selectionMode = question.selectionMode === "multiple" ? "multiple" : "single";
    if (selectionMode === "single" && ids.length !== 1) throw new FinderRequestError("Choose one answer for " + question.question + ".");
    const answers = ids.map((id) => question.answers.find((item) => item.id === id));
    if (answers.some((answer) => !answer)) throw new FinderRequestError("An answer does not belong to this quiz.");
    return { ...(answers[0] as FinderAnswer), questionId: question.id, answers: answers as FinderAnswer[] };
  });
}
const normalized = (value: unknown) => String(value).trim().toLowerCase();
function matches(actual: unknown, rule: FinderAnswer): boolean {
  if (actual === null || actual === undefined) return false;
  if (Array.isArray(actual)) return actual.some((value) => matches(value, rule));
  if (!["string", "number", "boolean"].includes(typeof actual)) return false;
  const numeric = rule.field === "price" || !["equals", "contains"].includes(rule.operator) || typeof actual === "number";
  if (numeric) {
    if (!String(actual).trim() || !rule.value.trim()) return false;
    const a = Number(actual), b = Number(rule.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    switch (rule.operator) {
      case "equals": return a === b;
      case "greater_than": return a > b;
      case "greater_than_or_equal": return a >= b;
      case "less_than": return a < b;
      case "less_than_or_equal": return a <= b;
      default: return false;
    }
  }
  return rule.operator === "equals" ? normalized(actual) === normalized(rule.value)
    : rule.operator === "contains" && normalized(actual).includes(normalized(rule.value));
}
export function answerMatches(variant: Candidate, rule: FinderAnswer) {
  let actual: unknown;
  if (rule.field === "collection") throw new FinderRequestError("Collection filters must be applied by the catalog query.", 500);
  if (rule.field.startsWith("metafield.")) actual = variant.metafields[rule.field.slice(10)];
  else if (rule.field.startsWith("variant_option.")) actual = variant.options.find((option) => normalized(option.name) === normalized(rule.field.slice(15)))?.value;
  else actual = ({ price: variant.price, availability: variant.available, vendor: variant.vendor, product_type: variant.productType, tags: variant.tags } as Record<string, unknown>)[rule.field];
  return matches(actual, rule);
}
export function matchesAllQuestions(variant: Candidate, selections: SelectedQuestion[]) {
  return selections.every((selection) => selection.answers.some((answer) => answer.field === "collection" || answerMatches(variant, answer)));
}
export function scoreVariant(variant: Candidate, rules: FinderAnswer[]) {
  return rules.reduce((score, rule) => score + (Number.isFinite(rule.weight) && rule.weight > 0 && answerMatches(variant, rule) ? rule.weight : 0), 0);
}
function exactProducts(candidates: Candidate[], selections: SelectedQuestion[]) {
  const eligible = candidates.filter((candidate) => matchesAllQuestions(candidate, selections))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.price - b.price || a.id.localeCompare(b.id) || a.variantId.localeCompare(b.variantId));
  const seen = new Set<string>();
  return eligible.filter((candidate) => !seen.has(candidate.id) && Boolean(seen.add(candidate.id)));
}
export function rankMatchingProducts(candidates: Candidate[], selections: SelectedQuestion[], offset: number, limit: number) {
  const matched = exactProducts(candidates, selections);
  const start = Math.max(0, offset);
  const page = matched.slice(start, start + Math.max(1, Math.min(20, limit)));
  return {
    totalCount: matched.length,
    hasMore: start + page.length < matched.length,
    products: page.map((candidate) => ({ id: candidate.id, variantId: candidate.variantId, title: candidate.title, handle: candidate.handle, matchPercentage: 100, currencyCode: candidate.currencyCode })),
  };
}
export function rankProducts(candidates: Candidate[], rules: FinderAnswer[], limit: number) {
  const maxScore = rules.reduce((sum, rule) => sum + (Number.isFinite(rule.weight) && rule.weight > 0 ? rule.weight : 0), 0);
  if (!maxScore) return [];
  const scored = candidates.map((candidate) => ({ candidate, score: scoreVariant(candidate, rules) })).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.candidate.available) - Number(a.candidate.available) || a.candidate.price - b.candidate.price || a.candidate.id.localeCompare(b.candidate.id) || a.candidate.variantId.localeCompare(b.candidate.variantId));
  const seen = new Set<string>();
  return scored.filter(({ candidate }) => !seen.has(candidate.id) && Boolean(seen.add(candidate.id))).slice(0, Math.max(1, Math.min(10, limit))).map(({ candidate, score }) => ({
    id: candidate.id, variantId: candidate.variantId, title: candidate.title, handle: candidate.handle, matchPercentage: Math.round(score / maxScore * 1000) / 10,
  }));
}
