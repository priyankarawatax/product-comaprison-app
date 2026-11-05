import { setTimeout as delay } from "node:timers/promises";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { FinderAnswer, FinderRuleSet } from "./config";
import { FinderRequestError, type Candidate, type SelectedQuestion } from "./scoring";
export type FinderCatalogTargets = Pick<FinderRuleSet, "sourceType" | "collections" | "vendors" | "products">;

type Metafield = { type: string; value: string } | null;
type VariantNode = {
  id: string; title: string; price: string; availableForSale: boolean;
  contextualPricing?: { price?: { amount?: string; currencyCode?: string } | null } | null;
  selectedOptions: { name: string; value: string }[];
  product: { id: string; handle: string; title: string; vendor: string; productType: string;
    tags: string[]; status: string; onlineStoreUrl: string | null; publishedInContext?: boolean } & Record<string, unknown>;
};
const cache = new Map<string, { expires: number; pending: boolean; result: Promise<Candidate[]> }>();
const requests = new Map<string, { expires: number; count: number }>();
export function allowFinderRequest(shop: string) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.expires <= now) requests.delete(key);
  const bucket = requests.get(shop) || { expires: now + 60000, count: 0 };
  if (!requests.has(shop) && requests.size >= 2000) return false;
  bucket.count += 1; requests.set(shop, bucket);
  return bucket.count <= 60;
}
export function catalogQuery(fields: string[]) {
  if (fields.length > 20 || fields.some((field) => !/^[A-Za-z0-9_-]{3,255}[.][A-Za-z0-9_-]{3,64}$/.test(field))) throw new Error("Invalid metafield rule");
  const aliases = fields.map((field, index) => {
    const [namespace, key] = field.split(".");
    return `mf${index}: metafield(namespace: ${JSON.stringify(namespace)}, key: ${JSON.stringify(key)}) { type value }`;
  }).join(" ");
  return `#graphql
    query FinderCatalog($after: String, $first: Int!, $query: String!, $country: CountryCode!) {
      productVariants(first: $first, after: $after, query: $query, sortKey: ID) {
        nodes {
          id title price availableForSale selectedOptions { name value }
          contextualPricing(context: { country: $country }) { price { amount currencyCode } }
          product { id handle title vendor productType tags status onlineStoreUrl publishedInContext(context: { country: $country }) ${aliases} }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
}
function metafieldValue(field: Metafield): unknown {
  if (!field) return undefined;
  if (field.type.startsWith("list.")) {
    try { const value = JSON.parse(field.value); return Array.isArray(value) ? (field.type.includes("number_") ? value.map(Number) : value) : undefined; } catch { return undefined; }
  }
  if (["number_integer", "number_decimal"].includes(field.type)) return Number(field.value);
  if (field.type === "boolean") return field.value === "true";
  // Structured JSON and reference values are not treated as display labels.
  return ["single_line_text_field", "multi_line_text_field", "url", "color", "date", "date_time"].includes(field.type) ? field.value : undefined;
}
export async function loadFinderCatalog(admin: AdminApiContext, shop: string, targets: FinderCatalogTargets | string | string[] | null, version: number, input: SelectedQuestion[] | FinderAnswer[], country = "US") {
  if (!/^[A-Z]{2}$/.test(country)) throw new FinderRequestError("Invalid market context.");
  const selections: SelectedQuestion[] = input.length && "questionId" in input[0] ? input as SelectedQuestion[] : (input as FinderAnswer[]).map((answer) => ({ questionId: answer.id, answers: [answer] }));
  const rules = selections.flatMap((selection) => selection.answers);
  if (!rules.every((rule) => ["price", "availability", "vendor", "product_type", "tags", "collection"].includes(rule.field) || rule.field.startsWith("variant_option.") || rule.field.startsWith("metafield."))) throw new FinderRequestError("A configured Product Finder mapping is unsupported.", 422);
  const fields = [...new Set(rules.filter((rule) => rule.field.startsWith("metafield.")).map((rule) => rule.field.slice(10)))].sort();
  const filter = buildFilter(targets, selections);
  const key = JSON.stringify([shop, targets, version, fields, filter, country]);
  const now = Date.now();
  for (const [name, entry] of cache) if (!entry.pending && entry.expires <= now) cache.delete(name);
  const hit = cache.get(key);
  if (hit) return hit.result;
  if (cache.size >= 5) {
    const oldest = [...cache].find(([, entry]) => !entry.pending);
    if (!oldest) throw new FinderRequestError("Product Finder is busy. Please try again shortly.", 429);
    cache.delete(oldest[0]);
  }
  const entry = { expires: Infinity, pending: true, result: Promise.resolve([] as Candidate[]) };
  entry.result = readCatalog(admin, fields, filter, country).then((data) => {
    entry.pending = false; entry.expires = Date.now() + 60000; return data;
  }).catch((error) => { cache.delete(key); throw error; });
  cache.set(key, entry);
  return entry.result;
}
function gidId(value: string, type: "Collection" | "Product") {
  const match = value.match(new RegExp("^gid://shopify/" + type + "/([1-9][0-9]*)$"));
  if (!match) throw new FinderRequestError("A configured " + type.toLowerCase() + " mapping is disconnected.", 422);
  return match[1];
}
function searchValue(value: string) { return "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'"; }
function buildFilter(targets: FinderCatalogTargets | string | string[] | null, selections: SelectedQuestion[]) {
  const clauses = ["published_status:published"];
  if (typeof targets === "string" || Array.isArray(targets) || targets === null) {
    const ids = (Array.isArray(targets) ? targets : targets ? [targets] : []).map((id) => gidId(id, "Collection"));
    if (ids.length) clauses.push("(" + ids.map((id) => "collection:" + id).join(" OR ") + ")");
  } else if (targets.sourceType === "collection") {
    const ids = targets.collections.map((item) => gidId(item.id, "Collection"));
    if (ids.length) clauses.push("(" + ids.map((id) => "collection:" + id).join(" OR ") + ")");
  } else if (targets.sourceType === "vendor") {
    if (targets.vendors.length) clauses.push("(" + targets.vendors.map((vendor) => "vendor:" + searchValue(vendor)).join(" OR ") + ")");
  } else if (targets.sourceType === "product") {
    if (targets.products.length) clauses.push("(" + targets.products.map((product) => "product_id:" + gidId(product.id, "Product")).join(" OR ") + ")");
  }
  for (const selection of selections) {
    const values = selection.answers.filter((answer) => answer.field === "collection");
    if (values.length && values.length !== selection.answers.length) throw new FinderRequestError("A question cannot mix collection and non-collection mappings.", 422);
    if (values.length) clauses.push("(" + values.map((answer) => "collection:" + gidId(answer.value, "Collection")).join(" OR ") + ")");
  }
  return clauses.join(" AND ");
}
async function readCatalog(admin: AdminApiContext, fields: string[], filter: string, country: string) {
  const query = catalogQuery(fields);
  const candidates: Candidate[] = [];
  let after: string | null = null;
  const deadline = Date.now() + 45000;
  for (;;) {
    if (Date.now() > deadline) throw new FinderRequestError("Products are taking longer to load. Please try again shortly.", 503);
    const response = await admin.graphql(query, { variables: { after, first: Math.max(10, Math.floor(600 / (fields.length + 6))), query: filter, country } });
    const result = await response.json();
    if (("errors" in result && result.errors) || !result.data?.productVariants) throw new Error("Catalog unavailable");
    const connection = result.data.productVariants as { nodes: VariantNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    for (const variant of connection.nodes) {
      const product = variant.product;
      const contextual = variant.contextualPricing?.price;
      const amount = Number(contextual?.amount ?? variant.price);
      if (product.status !== "ACTIVE" || product.publishedInContext !== true || !Number.isFinite(amount)) continue;
      candidates.push({
        id: product.id.split("/").pop()!, variantId: variant.id.split("/").pop()!, title: product.title,
        handle: product.handle, price: amount, currencyCode: contextual?.currencyCode, available: variant.availableForSale,
        vendor: product.vendor, productType: product.productType, tags: product.tags, options: variant.selectedOptions,
        metafields: Object.fromEntries(fields.map((field, index) => [field, metafieldValue(product["mf" + index] as Metafield)])),
      });
    }
    if (!connection.pageInfo.hasNextPage) return candidates;
    if (candidates.length >= 20000) throw new FinderRequestError("This catalog is too large for complete Product Finder matching. Narrow the rule scope or configure supported Shopify storefront filters.", 422);
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || cursor === after) throw new Error("Invalid catalog cursor");
    after = cursor;
    const cost = (result as { extensions?: { cost?: { requestedQueryCost: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } } } }).extensions?.cost;
    if (cost?.throttleStatus?.restoreRate && cost.requestedQueryCost > cost.throttleStatus.currentlyAvailable) {
      const wait = Math.ceil((cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate * 1000);
      if (Date.now() + wait >= deadline) throw new FinderRequestError("Products are taking longer to load. Please try again shortly.", 503);
      await delay(wait);
    }
  }
}
