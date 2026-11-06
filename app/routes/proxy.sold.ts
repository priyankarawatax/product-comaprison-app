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
    const sold = await reportCounts(admin, ids);
    return Response.json({ sold }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Sold counts unavailable" }, { status: 503, headers });
  }
}
