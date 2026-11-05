import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { parseAnalyticsEvent } from "../analytics/events";

const response = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
export function loader() { return response(405); }

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return response(405);
  const { session } = await authenticate.public.appProxy(request);
  const query = new URL(request.url).searchParams;
  const shop = session?.shop;
  const timestamp = Number(query.get("timestamp"));
  if (!shop || query.get("shop") !== shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return response(403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response(415);
  if (Number(request.headers.get("content-length")) > 8192) return response(413);
  // Bound streamed bodies too; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      const value = chunk.value;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); return response(413); }
      chunks.push(value);
    }
    const data = parseAnalyticsEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!data) return response(400);
    const store = await db.store.findUnique({ where: { shop }, select: { uninstalledAt: true } });
    if (!store || store.uninstalledAt) return response(403);
    const since = new Date(Date.now() - 60_000);
    const [visitorCount, shopCount] = await Promise.all([
      db.analyticsEvent.count({ where: { shop, sessionId: data.sessionId, createdAt: { gte: since } } }),
      db.analyticsEvent.count({ where: { shop, createdAt: { gte: since } } }),
    ]);
    if (visitorCount >= 120 || shopCount >= 5000) return response(429);
    const { comparedProductIds, ...event } = data;
    const createdAt = new Date();
    await db.analyticsEvent.create({ data: {
      ...event, shop, createdAt,
      comparedProducts: data.eventType === "comparison_opened" ? {
        create: comparedProductIds.map((productId) => ({ shop, productId, createdAt })),
      } : undefined,
    } });
    return response(204);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return response(204);
    if (error instanceof SyntaxError) return response(400);
    return response(503);
  }
}
