import type { LoaderFunctionArgs } from "react-router";
import { resolveWishlistStore, response, verifiedProxyContext, productIdPattern } from "../wishlist/api.server";
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return response(405);
  try {
    const auth = await verifiedProxyContext(request); if (!auth) return response(403, { error: "Unauthorized" });
    const store = await resolveWishlistStore(auth.shop); if (!store) return response(404, { error: "Store not found" }); if (!store.settings.enabled) return response(403, { error: "Wishlist disabled" });
    const query = new URL(request.url).searchParams;
    const ids = [...new Set((query.get("ids") || "").split(",").filter(Boolean))];
    const handles = [...new Set((query.get("handles") || "").split(",").filter(Boolean))];
    if ((!ids.length && !handles.length) || ids.length + handles.length > 50 || ids.some((id) => !productIdPattern.test(id)) || handles.some((handle) => !/^[a-z0-9][a-z0-9-]{0,254}$/.test(handle))) return response(400, { error: "Invalid products" });
    if (!auth.admin) return response(503, { error: "Product access unavailable" });
    const queryText = ids.length ? `query WishlistProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title handle status availableForSale featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } compareAtPriceRange { minVariantPrice { amount currencyCode } } variants(first: 100) { nodes { id title price availableForSale } } } } }` : `query WishlistProducts($query: String!) { products(first: 50, query: $query) { nodes { id title handle status availableForSale featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } compareAtPriceRange { minVariantPrice { amount currencyCode } } variants(first: 100) { nodes { id title price availableForSale } } } } }`;
    const variables = ids.length ? { ids: ids.map((id) => `gid://shopify/Product/${id}`) } : { query: handles.map((handle) => `handle:${handle}`).join(" OR ") };
    const result = await auth.admin.graphql(queryText, { variables });
    const json = await result.json() as { data?: { nodes?: Array<{ id: string; title: string; handle: string; status: string; availableForSale: boolean; featuredImage?: { url?: string; altText?: string } | null; priceRange?: { minVariantPrice?: { amount?: string; currencyCode?: string } }; compareAtPriceRange?: { minVariantPrice?: { amount?: string; currencyCode?: string } }; variants?: { nodes?: Array<{ id: string; title: string; price: string; availableForSale: boolean }> } | null } | null> }; errors?: unknown[] };
    if (json.errors?.length || !json.data?.nodes) return response(503, { error: "Products unavailable" });
    const products = (json.data.nodes || []).filter((p): p is NonNullable<typeof p> => p !== null && p.status === "ACTIVE").map((p) => ({ id: p.id.split("/").pop(), handle: p.handle, title: p.title, url: `/products/${encodeURIComponent(p.handle)}`, image: p.featuredImage?.url || null, imageAlt: p.featuredImage?.altText || p.title, available: p.availableForSale, currencyCode: p.priceRange?.minVariantPrice?.currencyCode || "", price: p.priceRange?.minVariantPrice?.amount ? `${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode || ""}`.trim() : "", compareAtPrice: p.compareAtPriceRange?.minVariantPrice?.amount || null, variants: (p.variants?.nodes || []).map((v) => ({ id: v.id.split("/").pop(), title: v.title, price: v.price, available: v.availableForSale })), variantId: p.variants?.nodes?.find((v) => v.availableForSale)?.id.split("/").pop() || null }));
    return response(200, { products });
  } catch { return response(503, { error: "Products unavailable" }); }
}
