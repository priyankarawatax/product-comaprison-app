import { setTimeout as delay } from "node:timers/promises";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { FinderTemplateCatalog } from "./templates";

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Node = { productType?: string; vendor?: string; tags?: string[]; options?: Array<{ name?: string; optionValues?: Array<{ name?: string }> }>; variants?: { nodes?: Array<{ price?: string; availableForSale?: boolean }> }; metafields?: { nodes?: Array<{ namespace?: string; key?: string; type?: string; value?: string; definition?: { id?: string; name?: string } | null }> } };
type Result = { data?: { shop?: { currencyCode?: string }; products?: { nodes?: Node[]; pageInfo?: PageInfo }; collections?: { nodes?: Array<{ id?: string; title?: string }>; pageInfo?: PageInfo }; metafieldDefinitions?: { nodes?: Array<{ id?: string; namespace?: string; key?: string; name?: string; type?: { name?: string } }>; pageInfo?: PageInfo } }; errors?: Array<{ message?: string; extensions?: { code?: string } }>; extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable?: number; restoreRate?: number } } } };
const QUERY = "query ProductFinderTemplateCatalog($productsAfter: String, $collectionsAfter: String, $definitionsAfter: String) {\n  shop { currencyCode }\n  products(first: 25, after: $productsAfter, query: \"status:active\", sortKey: ID) {\n    nodes {\n      id\n      productType\n      vendor\n      tags\n      options { name optionValues { name } }\n      variants(first: 20) { nodes { price availableForSale } }\n      metafields(first: 20) { nodes { namespace key type value definition { id name } } }\n    }\n    pageInfo { hasNextPage endCursor }\n  }\n  collections(first: 50, after: $collectionsAfter, sortKey: ID) {\n    nodes { id title }\n    pageInfo { hasNextPage endCursor }\n  }\n  metafieldDefinitions(first: 50, after: $definitionsAfter, ownerType: PRODUCT) {\n    nodes { id namespace key name type { name } }\n    pageInfo { hasNextPage endCursor }\n  }\n}";
const cache = new Map<string, { expires: number; promise: Promise<FinderTemplateCatalog> }>();
const add = (map: Map<string, string>, value: unknown) => { if (typeof value !== "string") return; const clean = value.trim(); if (clean && !map.has(clean.toLowerCase())) map.set(clean.toLowerCase(), clean); };
const list = (map: Map<string, string>) => [...map.values()].sort((a, b) => a.localeCompare(b)).slice(0, 20);
function parsedValues(type: string, raw: string) {
  if (type.startsWith("list.")) { try { const data = JSON.parse(raw); return Array.isArray(data) ? data.filter((item) => ["string", "number", "boolean"].includes(typeof item)).map(String) : []; } catch { return []; } }
  return ["single_line_text_field", "multi_line_text_field", "number_integer", "number_decimal", "boolean", "url", "color", "date", "date_time"].includes(type) ? [raw] : [];
}
async function query(admin: AdminApiContext, variables: Record<string, string | null>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await admin.graphql(QUERY, { variables });
    const result = await response.json() as Result;
    const throttled = result.errors?.some((error) => error.extensions?.code === "THROTTLED");
    if (!throttled) {
      if (result.errors?.length || !result.data?.products || !result.data.collections || !result.data.metafieldDefinitions) throw new Error(result.errors?.[0]?.message || "Shopify catalog data is unavailable.");
      return result;
    }
    if (attempt === 2) throw new Error("Shopify API is busy. Try loading the template again.");
    const status = result.extensions?.cost?.throttleStatus;
    const needed = result.extensions?.cost?.requestedQueryCost || 1;
    const wait = status?.restoreRate ? Math.ceil(Math.max(1, needed - (status.currentlyAvailable || 0)) / status.restoreRate * 1000) : 500;
    await delay(Math.min(2000, Math.max(250, wait)));
  }
  throw new Error("Shopify catalog data is unavailable.");
}
async function load(admin: AdminApiContext): Promise<FinderTemplateCatalog> {
  const productTypes = new Map<string, string>(), vendors = new Map<string, string>(), tags = new Map<string, string>();
  const prices = new Set<number>(), collections = new Map<string, string>();
  const options = new Map<string, { name: string; values: Map<string, string> }>();
  const definitions = new Map<string, { id: string; key: string; name: string; type: string; values: Map<string, string> }>();
  let currencyCode = "", available = false, soldOut = false;
  let productsAfter: string | null = null, collectionsAfter: string | null = null, definitionsAfter: string | null = null;
  let productsDone = false, collectionsDone = false, definitionsDone = false;
  const warnings: string[] = [];
  for (let page = 0; page < 4 && !(productsDone && collectionsDone && definitionsDone); page += 1) {
    const result = await query(admin, { productsAfter, collectionsAfter, definitionsAfter });
    const data = result.data!; currencyCode = data.shop?.currencyCode || currencyCode;
    if (!productsDone) for (const product of data.products?.nodes || []) {
      add(productTypes, product.productType); add(vendors, product.vendor); for (const tag of product.tags || []) add(tags, tag);
      for (const option of product.options || []) if (option.name?.trim()) { const key = option.name.toLowerCase(); const entry = options.get(key) || { name: option.name.trim(), values: new Map<string, string>() }; for (const value of option.optionValues || []) add(entry.values, value.name); options.set(key, entry); }
      for (const variant of product.variants?.nodes || []) { const price = Number(variant.price); if (Number.isFinite(price) && price >= 0) prices.add(price); if (variant.availableForSale === true) available = true; if (variant.availableForSale === false) soldOut = true; }
      for (const metafield of product.metafields?.nodes || []) if (metafield.definition?.id && metafield.namespace && metafield.key && metafield.type && typeof metafield.value === "string") {
        const key = metafield.namespace + "." + metafield.key; const entry = definitions.get(key) || { id: metafield.definition.id, key, name: metafield.definition.name || key, type: metafield.type, values: new Map<string, string>() };
        for (const value of parsedValues(metafield.type, metafield.value)) add(entry.values, value); definitions.set(key, entry);
      }
    }
    if (!collectionsDone) for (const item of data.collections?.nodes || []) if (item.id && item.title) collections.set(item.id, item.title);
    if (!definitionsDone) for (const item of data.metafieldDefinitions?.nodes || []) if (item.id && item.namespace && item.key && item.type?.name) { const key = item.namespace + "." + item.key; if (!definitions.has(key)) definitions.set(key, { id: item.id, key, name: item.name || key, type: item.type.name, values: new Map<string, string>() }); }
    const pp = data.products!.pageInfo!, cp = data.collections!.pageInfo!, dp = data.metafieldDefinitions!.pageInfo!;
    productsDone ||= !pp.hasNextPage || !pp.endCursor; collectionsDone ||= !cp.hasNextPage || !cp.endCursor; definitionsDone ||= !dp.hasNextPage || !dp.endCursor;
    if (!productsDone) productsAfter = pp.endCursor; if (!collectionsDone) collectionsAfter = cp.endCursor; if (!definitionsDone) definitionsAfter = dp.endCursor;
  }
  if (!productsDone) warnings.push("Suggestions use the first 100 active products; you can edit or add values.");
  if (!collectionsDone) warnings.push("Collection suggestions use the first 200 collections.");
  if (!definitionsDone) warnings.push("Metafield suggestions use the first 200 product definitions.");
  if (!currencyCode) throw new Error("Store currency is unavailable from Shopify.");
  return { currencyCode, productTypes: list(productTypes), vendors: list(vendors), collections: [...collections].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 20), prices: [...prices].sort((a, b) => a - b), availability: { available, soldOut }, options: Object.fromEntries([...options.values()].map((entry) => [entry.name, list(entry.values)])), tags: list(tags), metafields: [...definitions.values()].map((entry) => ({ id: entry.id, key: entry.key, name: entry.name, type: entry.type, values: list(entry.values) })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50), warnings };
}
export function getFinderTemplateCatalog(admin: AdminApiContext, shop: string) {
  const now = Date.now(); for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const hit = cache.get(shop); if (hit) return hit.promise; if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  const promise = load(admin).catch((error) => { cache.delete(shop); throw error; }); cache.set(shop, { expires: now + 300_000, promise }); return promise;
}
