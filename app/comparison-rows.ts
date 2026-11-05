export const COMPARISON_ROWS = [
  { id: "variantTitle", label: "Variant" },
  { id: "price", label: "Price" },
  { id: "vendor", label: "Vendor" },
  { id: "type", label: "Product type" },
  { id: "available", label: "Availability" },
  { id: "sku", label: "SKU" },
  { id: "rating", label: "Customer rating" },
  { id: "reviewCount", label: "Reviews" },
  { id: "soldCount", label: "Total sold" },
  { id: "description", label: "Description" },
] as const;

export const DEFAULT_ROW_ORDER = COMPARISON_ROWS.map((row) => row.id);
export type ComparisonMetafield = { id: string; label: string; namespace: string; key: string };
export function isMetafields(value: unknown): value is ComparisonMetafield[] {
  return Array.isArray(value) && value.length <= 20 && value.every((field) =>
    field && typeof field.namespace === "string" && /^[A-Za-z0-9_-]{3,255}$/.test(field.namespace) &&
    typeof field.key === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(field.key) &&
    field.id === `metafield:${field.namespace}.${field.key}` &&
    typeof field.label === "string" && field.label.trim().length > 0 && field.label.length <= 80
  ) && new Set(value.map((field) => field.id)).size === value.length;
}
export function readMetafields(value?: string | null): ComparisonMetafield[] {
  try { const parsed: unknown = JSON.parse(value || "null"); if (isMetafields(parsed)) return parsed; } catch { /* No configured metafields. */ }
  return [];
}
function rowIds(fields: ComparisonMetafield[]) { return [...DEFAULT_ROW_ORDER.filter((id) => id !== "description"), ...fields.map((field) => field.id), "description"]; }
function descriptionLast(ids: string[]) { return [...ids.filter((id) => id !== "description"), "description"]; }
function defaultRowLabels(fields: ComparisonMetafield[]) {
  return Object.fromEntries([...COMPARISON_ROWS, ...fields].map((row) => [row.id, row.label]));
}
export function isRowLabels(value: unknown, fields: ComparisonMetafield[] = []): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const validIds = new Set(rowIds(fields));
  const entries = Object.entries(value);
  return entries.length <= validIds.size && entries.every(([id, label]) =>
    validIds.has(id) && typeof label === "string" && label.trim().length > 0 && label.trim().length <= 40
  );
}
export function readRowLabels(value?: string | null, fields: ComparisonMetafield[] = []): Record<string, string> {
  const defaults = defaultRowLabels(fields);
  try {
    const parsed: unknown = JSON.parse(value || "null");
    if (isRowLabels(parsed, fields)) {
      for (const [id, label] of Object.entries(parsed)) defaults[id] = label.trim();
    }
  } catch { /* Invalid labels use defaults. */ }
  return defaults;
}
export function isDisabledRows(value: unknown, fields: ComparisonMetafield[] = []): value is string[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.every((id) => rowIds(fields).includes(id));
}
export function readDisabledRows(value?: string | null, fields: ComparisonMetafield[] = []): string[] {
  try { const parsed: unknown = JSON.parse(value || "null"); if (isDisabledRows(parsed, fields)) return parsed; } catch { /* All rows enabled by default. */ }
  return [];
}
export function moveRow(order: string[], source: string, target: string): string[] {
  const from = order.indexOf(source);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}
export function isRowOrder(value: unknown, fields: ComparisonMetafield[] = []): value is string[] {
  return Array.isArray(value) && value.length === rowIds(fields).length &&
    new Set(value).size === value.length && value.every((id) => rowIds(fields).includes(id));
}
export function readRowOrder(value?: string | null, fields: ComparisonMetafield[] = []): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "null");
    if (isRowOrder(parsed, fields)) return descriptionLast(parsed);
    if (Array.isArray(parsed)) {
      const validIds = rowIds(fields);
      const knownIds = [...new Set(parsed.filter((id): id is string => typeof id === "string" && validIds.includes(id)))];
      if (knownIds.length) return descriptionLast([...knownIds, ...validIds.filter((id) => !knownIds.includes(id))]);
    }
  } catch { /* Unset or invalid settings use the default order. */ }
  return rowIds(fields);
}
