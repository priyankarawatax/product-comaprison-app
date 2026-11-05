import { SUBSCRIPTION_QUERY } from "./queries";

export type ActiveSubscription = {
  billingPeriod: string | null;
  cancelAtEndOfCycle: boolean;
  trialEndsAt: string | null;
  currentBillingCycle: { startTime: string; endTime: string } | null;
  items: Array<{
    handle: string;
    price: {
      __typename: string;
      active: boolean;
      currency: string;
      amount?: string;
    };
  }>;
  pendingUpdate: {
    billingPeriod: string | null;
    items: Array<{ handle: string }>;
  } | null;
  legacySubscriptionId: string | null;
};

function pricingAppHandle() {
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  if (!appHandle || !/^[a-z0-9][a-z0-9-]*$/.test(appHandle)) {
    throw new Error(
      "SHOPIFY_APP_HANDLE is missing or invalid. See docs/billing-setup.md.",
    );
  }
  return appHandle;
}

export function billingConfig() {
  const organizationId =
    process.env.SHOPIFY_PARTNER_ORGANIZATION_ID ||
    process.env.SHOPIFY_PARTNER_ORG_ID;
  const token =
    process.env.SHOPIFY_PARTNER_ACCESS_TOKEN ||
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const appId = process.env.SHOPIFY_PARTNER_APP_ID || process.env.SHOPIFY_APP_GID;
  if (
    !organizationId ||
    !/^\d+$/.test(organizationId) ||
    !token ||
    !appId ||
    !/^gid:\/\/shopify\/App\/\d+$/.test(appId)
  ) {
    throw new Error(
      "Shopify App Pricing configuration is incomplete. A Partner API client with Manage apps permission is required. See docs/billing-setup.md.",
    );
  }
  return { organizationId, token, appId };
}

export function pricingUrl(shop: string) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Invalid authenticated shop domain");
  }
  return `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/charges/${pricingAppHandle()}/pricing_plans`;
}

export function pricingPlanUrl(
  shop: string,
  planHandle: string,
  interval: "EVERY_30_DAYS" | "ANNUAL",
) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Invalid authenticated shop domain");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(planHandle)) {
    throw new Error("Invalid pricing plan handle");
  }
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${pricingAppHandle()}/plans/${planHandle}?interval=${interval}`;
}

export async function fetchActiveSubscription(
  shopId: string,
): Promise<ActiveSubscription | null> {
  const { organizationId, token, appId } = billingConfig();
  // Partner API's latest documented stable version; independent of Admin API version.
  const response = await fetch(
    `https://partners.shopify.com/${organizationId}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: SUBSCRIPTION_QUERY,
        variables: { appId, shopId },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new Error(`Subscription verification failed (${response.status})`);
  const result = await response.json();
  if (
    result.errors?.length ||
    !result.data ||
    !("activeSubscription" in result.data)
  ) {
    // Never treat API errors as cancellation or expose Partner credentials/errors to the browser.
    throw new Error("Partner API could not verify the subscription");
  }
  return result.data.activeSubscription;
}
