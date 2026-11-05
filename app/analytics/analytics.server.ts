import db from "../db.server";

export async function getAnalyticsSummary(shop: string, startDate: Date, endDate: Date) {
  const groups = await db.analyticsEvent.groupBy({
    by: ["eventType"], where: { shop, createdAt: { gte: startDate, lt: endDate } }, _count: { _all: true },
  });
  const count = (type: string) => groups.find((group) => group.eventType === type)?._count._all || 0;
  const opens = count("comparison_opened"), added = count("product_compare_added"), cart = count("comparison_add_to_cart");
  return { opens, added, cart, conversionRate: opens ? cart / opens * 100 : 0, total: groups.reduce((sum, group) => sum + group._count._all, 0) };
}

export async function getComparisonActivity(shop: string, startDate: Date, endDate: Date) {
  const rows = await db.$queryRaw<{ day: string; opens: bigint | number; cart: bigint | number }[]>`
    SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day,
      SUM(eventType = 'comparison_opened') AS opens,
      SUM(eventType = 'comparison_add_to_cart') AS cart
    FROM analytics_events
    WHERE shop = ${shop} AND createdAt >= ${startDate} AND createdAt < ${endDate}
      AND eventType IN ('comparison_opened', 'comparison_add_to_cart')
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d') ORDER BY day ASC`;
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days = [];
  for (let time = startDate.getTime(); time < endDate.getTime(); time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10);
    const row = byDay.get(day);
    days.push({ day, opens: Number(row?.opens || 0), cart: Number(row?.cart || 0) });
  }
  return days;
}

export async function getProductFinderActivity(shop: string, startDate: Date, endDate: Date) {
  const rows = await db.$queryRaw<{ day: string; clicks: bigint | number }[]>`
    SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day,
      COUNT(*) AS clicks
    FROM analytics_events
    WHERE shop = ${shop} AND createdAt >= ${startDate} AND createdAt < ${endDate}
      AND eventType = 'product_finder_opened'
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d') ORDER BY day ASC`;
  const byDay = new Map(rows.map((row) => [row.day, Number(row.clicks)]));
  const days = [];
  for (let time = startDate.getTime(); time < endDate.getTime(); time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10);
    days.push({ day, clicks: byDay.get(day) || 0 });
  }
  return days;
}
export async function getMostComparedProducts(shop: string, startDate: Date, endDate: Date, requestedPage = 1, pageSize = 10) {
  const totals = await db.$queryRaw<{ total: bigint | number }[]>`
    SELECT COUNT(*) AS total FROM (
      SELECT productId
      FROM analytics_events
      WHERE shop = ${shop} AND createdAt >= ${startDate} AND createdAt < ${endDate}
        AND productId IS NOT NULL AND eventType IN ('product_compare_added', 'comparison_add_to_cart')
      GROUP BY productId HAVING SUM(eventType = 'product_compare_added') > 0
    ) ranked_products`;
  const total = Number(totals[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await db.$queryRaw<{ productId: string; added: bigint | number; cart: bigint | number }[]>`
    SELECT productId,
      SUM(eventType = 'product_compare_added') AS added,
      SUM(eventType = 'comparison_add_to_cart') AS cart
    FROM analytics_events
    WHERE shop = ${shop} AND createdAt >= ${startDate} AND createdAt < ${endDate}
      AND productId IS NOT NULL AND eventType IN ('product_compare_added', 'comparison_add_to_cart')
    GROUP BY productId HAVING SUM(eventType = 'product_compare_added') > 0
    ORDER BY added DESC, productId ASC LIMIT ${pageSize} OFFSET ${offset}`;
  return {
    items: rows.map((row) => ({ productId: row.productId, added: Number(row.added), cart: Number(row.cart) })),
    total,
    page,
    totalPages,
  };
}

export async function getMostComparedTogether(shop: string, startDate: Date, endDate: Date, requestedPage = 1, pageSize = 10) {
  const totals = await db.$queryRaw<{ total: bigint | number }[]>`
    SELECT COUNT(*) AS total FROM (
      SELECT a.productId AS productA, b.productId AS productB
      FROM analytics_comparison_products a
      INNER JOIN analytics_comparison_products b
        ON a.eventId = b.eventId AND a.shop = b.shop AND a.productId < b.productId
      WHERE a.shop = ${shop} AND a.createdAt >= ${startDate} AND a.createdAt < ${endDate}
      GROUP BY a.productId, b.productId
    ) ranked_pairs`;
  const total = Number(totals[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await db.$queryRaw<{ productA: string; productB: string; comparisons: bigint | number }[]>`
    SELECT a.productId AS productA, b.productId AS productB, COUNT(*) AS comparisons
    FROM analytics_comparison_products a
    INNER JOIN analytics_comparison_products b
      ON a.eventId = b.eventId AND a.shop = b.shop AND a.productId < b.productId
    WHERE a.shop = ${shop} AND a.createdAt >= ${startDate} AND a.createdAt < ${endDate}
    GROUP BY a.productId, b.productId
    ORDER BY comparisons DESC, productA ASC, productB ASC LIMIT ${pageSize} OFFSET ${offset}`;
  return {
    items: rows.map((row) => ({ ...row, comparisons: Number(row.comparisons) })),
    total,
    page,
    totalPages,
  };
}