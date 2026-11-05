import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const productId = /^[1-9][0-9]{0,19}$/;
type AdminClient = Awaited<ReturnType<typeof authenticate.public.appProxy>>["admin"];

function emptyCounts(ids: string[]) { return Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>; }
function numericId(value: unknown) { return String(value ?? "").split("/").pop() || ""; }

async function reportCounts(admin: NonNullable<AdminClient>, ids: string[]) {
  const shopifyql = `FROM sales\nSHOW quantity_ordered\nWHERE product_id IN (${ids.join(", ")})\nGROUP BY product_id\nSINCE 2000-01-01 UNTIL today\nLIMIT 10`;
  const response = await admin.graphql(
    `#graphql
      query ProductSoldCounts($query: String!) {
        shopifyqlQuery(query: $query) {
          tableData { columns { name } rows }
          parseErrors
        }
      }
    `,
    { variables: { query: shopifyql } },
  );
  const result = await response.json() as {
    data?: { shopifyqlQuery?: { tableData?: { columns?: Array<{ name?: string }>; rows?: Array<Record<string, unknown> | unknown[]> }; parseErrors?: string[] } };
    errors?: unknown[];
  };
  const report = result.data?.shopifyqlQuery;
  if (result.errors?.length || report?.parseErrors?.length || !report?.tableData) throw new Error("Sales report unavailable");
  const columns = report.tableData.columns || [];
  const productIndex = columns.findIndex((column) => column.name === "product_id");
  const quantityIndex = columns.findIndex((column) => column.name === "quantity_ordered");
  if (productIndex < 0 || quantityIndex < 0) throw new Error("Sales report unavailable");
  const sold = emptyCounts(ids);
  for (const row of report.tableData.rows || []) {
    // ShopifyQL returns rows as objects keyed by column name, not positional arrays.
    // Keep positional handling as a compatibility fallback.
    const productValue = Array.isArray(row) ? row[productIndex] : row.product_id;
    const quantityValue = Array.isArray(row) ? row[quantityIndex] : row.quantity_ordered;
    const id = numericId(productValue);
    const count = Number(quantityValue);
    if (Object.hasOwn(sold, id) && Number.isSafeInteger(count) && count >= 0) sold[id] += count;
  }
  return sold;
}

async function testOrderCounts(admin: NonNullable<AdminClient>, ids: string[]) {
  const sold = emptyCounts(ids);
  let after: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const response = await admin.graphql(
      `#graphql
        query DevelopmentStoreTestOrderSoldCounts($after: String, $search: String!) {
          orders(first: 100, after: $after, query: $search) {
            nodes {
              displayFinancialStatus
              lineItems(first: 250) { nodes { quantity product { id } } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { variables: { after, search: "test:true" } },
    );
    const result = await response.json() as {
      data?: { orders?: { nodes?: Array<{ displayFinancialStatus?: string; lineItems?: { nodes?: Array<{ quantity?: number; product?: { id?: string } | null }> } }>; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } };
      errors?: unknown[];
    };
    const orders = result.data?.orders;
    if (result.errors?.length || !orders) throw new Error("Test orders unavailable");
    for (const order of orders.nodes || []) {
      if (!["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"].includes(order.displayFinancialStatus || "")) continue;
      for (const lineItem of order.lineItems?.nodes || []) {
        const id = numericId(lineItem.product?.id);
        const quantity = Number(lineItem.quantity);
        if (Object.hasOwn(sold, id) && Number.isSafeInteger(quantity) && quantity > 0) sold[id] += quantity;
      }
    }
    if (!orders.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) break;
    after = orders.pageInfo.endCursor;
  }
  return sold;
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return new Response(null, { status: 405, headers });
  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    const query = new URL(request.url).searchParams;
    const timestamp = Number(query.get("timestamp"));
    if (!session?.shop || !admin || query.get("shop") !== session.shop || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return Response.json({ error: "Unauthorized" }, { status: 403, headers });
    }
    const ids = [...new Set((query.get("ids") || "").split(",").filter(Boolean))];
    if (ids.length < 1 || ids.length > 10 || ids.some((id) => !productId.test(id))) {
      return Response.json({ error: "Invalid products" }, { status: 400, headers });
    }
    const planResponse = await admin.graphql(`#graphql
      query SoldCountStorePlan { shop { plan { partnerDevelopment } } }
    `);
    const planResult = await planResponse.json() as { data?: { shop?: { plan?: { partnerDevelopment?: boolean } } }; errors?: unknown[] };
    if (planResult.errors?.length || typeof planResult.data?.shop?.plan?.partnerDevelopment !== "boolean") {
      return Response.json({ error: "Sold counts unavailable" }, { status: 503, headers });
    }
    const isDevelopmentStore = planResult.data.shop.plan.partnerDevelopment;
    const [report, tests] = await Promise.allSettled([
      reportCounts(admin, ids),
      isDevelopmentStore ? testOrderCounts(admin, ids) : Promise.resolve(emptyCounts(ids)),
    ]);
    // Shopify sales reports exclude test orders. Add test-order quantities only
    // for development stores; production counts remain the real sales report.
    // A dev store can still show its test purchases if reports are unavailable.
    if (!isDevelopmentStore && report.status === "rejected") {
      return Response.json({ error: "Sold counts unavailable" }, { status: 503, headers });
    }
    if (isDevelopmentStore && report.status === "rejected" && tests.status === "rejected") {
      return Response.json({ error: "Sold counts unavailable" }, { status: 503, headers });
    }
    const sold = emptyCounts(ids);
    for (const id of ids) {
      sold[id] = (report.status === "fulfilled" ? report.value[id] : 0) +
        (tests.status === "fulfilled" ? tests.value[id] : 0);
    }
    return Response.json({ sold }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Sold counts unavailable" }, { status: 503, headers });
  }
}
