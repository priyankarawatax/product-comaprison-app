import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // authenticate.webhook validates Shopify's HMAC signature before any data is
  // read or deleted. Invalid or unsigned requests are rejected by the library.
  const { shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // This app doesn't store customer profiles or order-level customer data.
      // Storefront analytics are aggregate/pseudonymous and aren't keyed by a
      // Shopify customer ID, so there is no customer record to return.
      break;

    case "CUSTOMERS_REDACT":
      // This app doesn't persist data keyed by a Shopify customer ID.
      break;

    case "SHOP_REDACT":
      // Shopify sends this webhook after uninstall. Remove every record owned
      // by the shop; Store relations cascade to subscriptions, finder settings,
      // questions, answers, rules, and feature requests.
      await db.$transaction(async (tx) => {
        await tx.analyticsEvent.deleteMany({ where: { shop } });
        await tx.session.deleteMany({ where: { shop } });
        await tx.store.deleteMany({ where: { shop } });
      });
      break;

    default:
      throw new Response(`Unsupported compliance webhook topic: ${topic}`, {
        status: 400,
      });
  }

  return new Response(null, { status: 200 });
};
