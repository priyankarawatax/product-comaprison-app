import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const receivedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stores WHERE shop = ${shop} FOR UPDATE`;
    await tx.store.updateMany({
      where: { shop },
      data: {
        uninstalledAt: receivedAt,
        billingSelectionRequired: true,
      },
    });
    await tx.subscription.updateMany({
      where: { store: { shop } },
      data: { status: "UNINSTALLED", creditAllowance: 0, syncedAt: receivedAt },
    });
    await tx.session.deleteMany({ where: { shop } });
  });

  return new Response();
};
