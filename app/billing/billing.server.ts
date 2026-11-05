import { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { fetchActiveSubscription } from "./partner.server";
import { SHOP_QUERY } from "./queries";
import { resolveSubscription } from "./subscription-policy";
import { effectiveAccessPlan, getAccessEntitlements } from "./entitlements";

export async function saveStore(
  admin: AdminApiContext,
  authenticatedShop: string,
) {
  const response = await admin.graphql(SHOP_QUERY);
  const result = await response.json();
  const shop = result.data?.shop;
  if (!shop || shop.myshopifyDomain !== authenticatedShop) {
    throw new Error("Unable to verify store information");
  }
  const details = {
    shopifyId: shop.id,
    shop: shop.myshopifyDomain,
    name: shop.name,
    primaryDomain: shop.primaryDomain.host,
    currencyCode: shop.currencyCode,
    timezone: shop.ianaTimezone,
    isDevelopmentStore: shop.plan?.partnerDevelopment === true,
    uninstalledAt: null,
  };
  return db.store.upsert({
    where: { shop: authenticatedShop },
    create: details,
    update: details,
  });
}

export async function syncSubscription(store: {
  id: bigint;
  shopifyId: string;
  shop: string;
}) {
  const startedAt = new Date();
  const subscription = await fetchActiveSubscription(store.shopifyId);
  const matched = resolveSubscription(subscription, {
    free: process.env.SHOPIFY_FREE_ITEM_HANDLE || "free",
    growth: process.env.SHOPIFY_GROWTH_ITEM_HANDLE || "growth",
    pro: process.env.SHOPIFY_PRO_ITEM_HANDLE || "pro",
  });
  const data = {
    status: subscription ? (matched ? "ACTIVE" : "UNRECOGNIZED") : "INACTIVE",
    planKey: matched?.plan.key ?? null,
    itemHandle: matched?.item.handle ?? null,
    billingPeriod: subscription?.billingPeriod ?? null,
    amount: matched?.item.price.amount ?? null,
    currencyCode: matched?.item.price.currency ?? null,
    creditAllowance: 0,
    creditRenewal: null,
    cancelAtEndOfCycle: subscription?.cancelAtEndOfCycle ?? false,
    trialEndsAt: subscription?.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null,
    currentPeriodStart: subscription?.currentBillingCycle
      ? new Date(subscription.currentBillingCycle.startTime)
      : null,
    currentPeriodEnd: subscription?.currentBillingCycle
      ? new Date(subscription.currentBillingCycle.endTime)
      : null,
    legacySubscriptionId: subscription?.legacySubscriptionId ?? null,
    snapshot: subscription
      ? (JSON.parse(JSON.stringify(subscription)) as Prisma.InputJsonValue)
      : Prisma.DbNull,
    syncedAt: startedAt,
  };
  // Serializes concurrent sync/uninstall writes and rejects older observations.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${store.id} FOR UPDATE`;
    const currentStore = await tx.store.findUniqueOrThrow({
      where: { id: store.id },
    });
    const current = await tx.subscription.findUnique({
      where: { shop: store.shop },
    });
    if (currentStore.uninstalledAt || (current && current.syncedAt > startedAt))
      return current;
    return tx.subscription.upsert({
      where: { shop: store.shop },
      create: { shop: store.shop, ...data },
      update: data,
    });
  });
}

export async function loadBilling(admin: AdminApiContext, shop: string) {
  const store = await saveStore(admin, shop);
  // Development stores use Shopify's test pricing, but feature access still
  // follows the verified plan selected by the merchant.
  const subscription = await syncSubscription(store);
  const accessPlan = effectiveAccessPlan(subscription);
  const installationResponse = await admin.graphql(`#graphql
    query BillingEntitlementOwner { currentAppInstallation { id } }
  `);
  const installation = await installationResponse.json();
  const ownerId = installation.data?.currentAppInstallation?.id;
  if (!ownerId) throw new Error("Unable to update storefront entitlements");
  const entitlementResponse = await admin.graphql(`#graphql
    mutation SaveStorefrontEntitlements($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }
  `, {
    variables: {
      metafields: [{
        ownerId,
        namespace: "comparison",
        key: "plan_entitlements",
        type: "json",
        value: JSON.stringify(
          getAccessEntitlements(accessPlan),
        ),
      }],
    },
  });
  const entitlementResult = await entitlementResponse.json();
  if (
    ("errors" in entitlementResult && Array.isArray(entitlementResult.errors) && entitlementResult.errors.length > 0) ||
    entitlementResult.data?.metafieldsSet?.userErrors?.length
  ) throw new Error("Unable to update storefront entitlements");
  return { store, subscription, accessPlan };
}
