import db from "../db.server";
import { defaultWishlistSettings, type WishlistSettingsDraft } from "./config";

export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" };
export const productIdPattern = /^[1-9][0-9]{0,19}$/;
const mutationWindows = new Map<string, { start: number; count: number }>();
export function response(status: number, body: unknown = { error: "Request failed" }) { return Response.json(body, { status, headers: privateHeaders }); }
export function parseId(value: unknown) { if (typeof value !== "string" || !productIdPattern.test(value)) return null; return value; }

export async function checkMutation(request: Request, shop: string, customerId: string) {
  const originHeader = request.headers.get("Origin");
  if (!originHeader) return false;
  try {
    const origin = new URL(originHeader);
    const store = await db.store.findUnique({ where: { shop }, select: { primaryDomain: true } });
    const permitted = new Set([shop, store?.primaryDomain].filter(Boolean).map((host) => String(host).replace(/^https?:\/\//, "").split("/")[0].toLowerCase()));
    if (origin.protocol !== "https:" || !permitted.has(origin.hostname.toLowerCase())) return false;
  } catch { return false; }
  const key = `${shop}:${customerId}`; const now = Date.now(); const window = mutationWindows.get(key);
  if (!window || now - window.start >= 60_000) { mutationWindows.set(key, { start: now, count: 1 }); return true; }
  if (window.count >= 60) return false;
  window.count += 1; return true;
}

export async function validateProductVariant(admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> } | undefined, productId: string, variantId: string | null) {
  if (!admin) return false;
  const ids = [`gid://shopify/Product/${productId}`, ...(variantId ? [`gid://shopify/ProductVariant/${variantId}`] : [])];
  const result = await admin.graphql(`query ValidateWishlistResource($ids: [ID!]!) { nodes(ids: $ids) { __typename ... on Product { id status } ... on ProductVariant { id product { id status } } } }`, { variables: { ids } });
  const json = await result.json() as { data?: { nodes?: Array<{ __typename?: string; id?: string; status?: string; product?: { id?: string; status?: string } } | null> }; errors?: unknown[] };
  if (json.errors?.length || !json.data?.nodes || json.data.nodes.length !== ids.length) return false;
  const product = json.data.nodes[0]; if (product?.__typename !== "Product" || product.status !== "ACTIVE") return false;
  if (!variantId) return true;
  const variant = json.data.nodes[1]; return variant?.__typename === "ProductVariant" && variant.product?.id === `gid://shopify/Product/${productId}` && variant.product.status === "ACTIVE";
}

export async function resolveWishlistStore(shop: string) {
  const store = await db.store.findUnique({ where: { shop }, select: { id: true, wishlistSettings: { select: { enabled: true, generalSettings: true, buttonSettings: true, pageSettings: true, textSettings: true } } } });
  if (!store) return null;
  if (!store.wishlistSettings) return { id: store.id, settings: structuredClone(defaultWishlistSettings) };
  const row = store.wishlistSettings;
  const settings: WishlistSettingsDraft = { enabled: row.enabled, general: { ...defaultWishlistSettings.general, ...(row.generalSettings as WishlistSettingsDraft["general"]) }, button: { ...defaultWishlistSettings.button, ...(row.buttonSettings as Partial<WishlistSettingsDraft["button"]>) }, page: { ...defaultWishlistSettings.page, ...(row.pageSettings as Partial<WishlistSettingsDraft["page"]>) }, text: { ...defaultWishlistSettings.text, ...(row.textSettings as Partial<WishlistSettingsDraft["text"]>) }, setupGuideDismissed: false };
  return { id: store.id, settings };
}

export async function verifiedProxyContext(request: Request) {
  const { authenticate } = await import("../shopify.server");
  const context = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  if (!context.session?.shop || url.searchParams.get("shop") !== context.session.shop) return null;
  const customer = url.searchParams.get("logged_in_customer_id");
  return { shop: context.session.shop, customerId: customer && productIdPattern.test(customer) ? customer : null, admin: context.admin };
}

export async function limitedJson(request: Request, limit = 8192) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (let item = await reader.read(); !item.done; item = await reader.read()) { size += item.value.byteLength; if (size > limit) { await reader.cancel(); return null; } chunks.push(item.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { return null; }
}
