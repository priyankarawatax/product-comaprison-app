import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getStorePlanAccess } from "../billing/entitlements.server";

const productId = /^[1-9][0-9]{0,19}$/;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;
  if (!shop) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(",").filter(Boolean))];
  if (ids.length < 2 || ids.length > 10 || ids.some((id) => !productId.test(id))) return Response.json({ error: "Invalid products" }, { status: 400 });
  const store = (await db.$queryRaw<Array<{ smartBadgesEnabled: boolean; badgeLowestPrice: boolean; badgeBestRated: boolean; badgeMostPopular: boolean; badgeBestValue: boolean; maxBadgesPerProduct: number; badgeLowestPriceLabel: string; badgeBestRatedLabel: string; badgeMostPopularLabel: string; badgeBestValueLabel: string; uninstalledAt: Date | null }>>`
    SELECT smartBadgesEnabled, badgeLowestPrice, badgeBestRated, badgeMostPopular, badgeBestValue, maxBadgesPerProduct, badgeLowestPriceLabel, badgeBestRatedLabel, badgeMostPopularLabel, badgeBestValueLabel, uninstalledAt
    FROM stores WHERE shop = ${shop} LIMIT 1
  `)[0];
  if (!store || store.uninstalledAt) return Response.json({ error: "Unavailable" }, { status: 403 });
  const access = await getStorePlanAccess(shop);
  const settings = {
    enabled: access.entitlements.smartBadges && store.smartBadgesEnabled,
    lowestPrice: store.badgeLowestPrice,
    bestRated: store.badgeBestRated,
    mostPopular: store.badgeMostPopular,
    bestValue: store.badgeBestValue,
    maxPerProduct: store.maxBadgesPerProduct,
    labels: { lowest_price: store.badgeLowestPriceLabel, best_rated: store.badgeBestRatedLabel, most_popular: store.badgeMostPopularLabel, best_value: store.badgeBestValueLabel },
  };
  if (!settings.enabled) return Response.json({ settings, popularity: {} }, { headers: { "Cache-Control": "private, no-store" } });
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const counts = await db.analyticsComparisonProduct.groupBy({
    by: ["productId"],
    where: { shop, productId: { in: ids }, createdAt: { gte: since } },
    _count: { productId: true },
  });
  return Response.json({
    settings,
    popularity: Object.fromEntries(counts.map((entry) => [entry.productId, entry._count.productId])),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
