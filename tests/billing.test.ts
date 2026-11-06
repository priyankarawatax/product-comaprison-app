import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveSubscription } from "../app/billing/subscription-policy";
import {
  formatBillingDate,
  planActionLabel,
  PLANS,
} from "../app/billing/plans";
import {
  fetchActiveSubscription,
  pricingPlanUrl,
  pricingUrl,
  type ActiveSubscription,
} from "../app/billing/partner.server";

const handles = {
  free: "free",
  growth: "starter",
  pro: "growth",
};
function contract(handle = "starter", amount = "4.99"): ActiveSubscription {
  return {
    billingPeriod: "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    trialEndsAt: null,
    currentBillingCycle: null,
    pendingUpdate: null,
    legacySubscriptionId: null,
    items: [
      {
        handle,
        price: {
          __typename: "FlatRatePrice",
          active: true,
          currency: "USD",
          amount,
        },
      },
    ],
  };
}

test("no approved subscription grants no entitlement", () => {
  assert.equal(resolveSubscription(null, handles), null);
});
test("free must be a verified Shopify contract", () => {
  assert.equal(resolveSubscription(contract("free", "0"), handles)?.plan.key, "free");
});
test("dev-store zero price retains the paid plan identity", () => {
  assert.equal(resolveSubscription(contract("growth", "0"), handles)?.plan.key, "pro");
});
test("annual subscriptions retain their plan identity", () => {
  const value = { ...contract("starter", "49.90"), billingPeriod: "ANNUAL" };
  assert.equal(resolveSubscription(value, handles)?.plan.key, "growth");
});
test("pending downgrade preserves current entitlement", () => {
  const value = {
    ...contract("growth", "79"),
    cancelAtEndOfCycle: true,
    pendingUpdate: {
      billingPeriod: "EVERY_30_DAYS",
      items: [{ handle: "free" }],
    },
  };
  assert.equal(resolveSubscription(value, handles)?.plan.key, "pro");
});
test("unknown, ambiguous, or unsupported contracts fail closed", () => {
  assert.equal(resolveSubscription(contract("unknown"), handles), null);
  const ambiguous = contract();
  ambiguous.items.push(...contract("growth").items);
  assert.equal(resolveSubscription(ambiguous, handles), null);
  assert.equal(
    resolveSubscription(
      { ...contract(), billingPeriod: "EVERY_7_DAYS" },
      handles,
    ),
    null,
  );
});
test("an existing contract keeps its entitlement after its catalog price is replaced", () => {
  const existingContract = contract("growth", "0");
  existingContract.items[0].price.active = false;
  assert.equal(resolveSubscription(existingContract, handles)?.plan.key, "pro");
});
test("handles can be configured independently of plan display names", () => {
  assert.equal(
    resolveSubscription(contract("growth_plan"), {
      ...handles,
      growth: "growth_plan",
    })?.plan.key,
    "growth",
  );
});

test("a cancelling plan exposes a fresh Shopify approval action after reinstall", () => {
  const pro = PLANS.find((plan) => plan.key === "pro")!;
  assert.equal(
    planActionLabel(pro, "pro", "monthly", "monthly", true),
    "Reactivate Pro",
  );
  assert.equal(
    planActionLabel(pro, "pro", "monthly", "monthly", false),
    "Current plan",
  );
});

test("reinstall requires an explicit plan selection instead of restoring the old plan", () => {
  const free = PLANS.find((plan) => plan.key === "free")!;
  const pro = PLANS.find((plan) => plan.key === "pro")!;
  assert.equal(
    planActionLabel(free, "free", null, "monthly", false, true),
    "Select Free",
  );
  assert.equal(
    planActionLabel(pro, "free", null, "monthly", false, true),
    "Select Pro",
  );
});

test("subscription cancellation dates are stable across server time zones", () => {
  assert.equal(
    formatBillingDate(new Date("2026-11-30T23:59:59.000Z")),
    "November 30, 2026",
  );
});

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnvironment };
});
function configure() {
  process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = "123";
  process.env.SHOPIFY_PARTNER_ACCESS_TOKEN = "test-only-token";
  process.env.SHOPIFY_PARTNER_APP_ID = "gid://shopify/App/456";
  process.env.SHOPIFY_APP_HANDLE = "ai-visualization";
}
test("official Shopify Partner environment names are supported", async () => {
  configure();
  delete process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;
  delete process.env.SHOPIFY_PARTNER_ACCESS_TOKEN;
  delete process.env.SHOPIFY_PARTNER_APP_ID;
  process.env.SHOPIFY_PARTNER_ORG_ID = "123";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "test-only-token";
  process.env.SHOPIFY_APP_GID = "gid://shopify/App/456";
  globalThis.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://partners.shopify.com/123/api/2026-07/graphql.json",
    );
    assert.equal(
      (options?.headers as Record<string, string>)["X-Shopify-Access-Token"],
      "test-only-token",
    );
    return Response.json({ data: { activeSubscription: contract("growth", "0") } });
  };
  assert.equal(
    (await fetchActiveSubscription("gid://shopify/Shop/789"))?.items[0].handle,
    "growth",
  );
});
test("hosted pricing URL uses authenticated shop and configured app", () => {
  configure();
  assert.equal(
    pricingUrl("sample-shop.myshopify.com"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/pricing_plans",
  );
  assert.throws(() => pricingUrl("attacker.example/path"));
});

test("free plan URL targets the authenticated store and monthly interval", () => {
  configure();
  assert.equal(
    pricingPlanUrl("sample-shop.myshopify.com", "free", "EVERY_30_DAYS"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/plans/free?interval=EVERY_30_DAYS",
  );
  assert.throws(() =>
    pricingPlanUrl("attacker.example", "free", "EVERY_30_DAYS"),
  );
  assert.throws(() =>
    pricingPlanUrl("sample-shop.myshopify.com", "../free", "EVERY_30_DAYS"),
  );
  assert.equal(
    pricingPlanUrl("sample-shop.myshopify.com", "starter", "ANNUAL"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/plans/starter?interval=ANNUAL",
  );
  assert.equal(
    pricingPlanUrl("sample-shop.myshopify.com", "growth", "EVERY_30_DAYS"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/plans/growth?interval=EVERY_30_DAYS",
  );
  assert.equal(
    pricingPlanUrl("sample-shop.myshopify.com", "growth", "ANNUAL"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/plans/growth?interval=ANNUAL",
  );
});

test("plan selection works without subscription verification credentials", () => {
  configure();
  delete process.env.SHOPIFY_PARTNER_ACCESS_TOKEN;
  delete process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;
  delete process.env.SHOPIFY_PARTNER_APP_ID;
  assert.equal(
    pricingUrl("sample-shop.myshopify.com"),
    "https://admin.shopify.com/store/sample-shop/charges/ai-visualization/pricing_plans",
  );
});

test("plan selection still requires a valid app handle", () => {
  configure();
  delete process.env.SHOPIFY_APP_HANDLE;
  assert.throws(() => pricingUrl("sample-shop.myshopify.com"));
  process.env.SHOPIFY_APP_HANDLE = "invalid/handle";
  assert.throws(() => pricingUrl("sample-shop.myshopify.com"));
});

test("missing Partner credentials never grant subscription access", async () => {
  configure();
  delete process.env.SHOPIFY_PARTNER_ACCESS_TOKEN;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return Response.json({ data: { activeSubscription: contract("growth") } });
  };
  await assert.rejects(fetchActiveSubscription("gid://shopify/Shop/789"));
  assert.equal(fetched, false);
});
test("Partner request is scoped to configured app and verified shop GID", async () => {
  configure();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://partners.shopify.com/123/api/2026-07/graphql.json",
    );
    assert.deepEqual(JSON.parse(String(options?.body)).variables, {
      appId: "gid://shopify/App/456",
      shopId: "gid://shopify/Shop/789",
    });
    return Response.json({ data: { activeSubscription: contract() } });
  };
  assert.equal(
    (await fetchActiveSubscription("gid://shopify/Shop/789"))?.items[0].handle,
    "starter",
  );
});
test("a successful null response is distinguished from API errors", async () => {
  configure();
  globalThis.fetch = async () =>
    Response.json({ data: { activeSubscription: null } });
  assert.equal(await fetchActiveSubscription("gid://shopify/Shop/789"), null);
  for (const body of [
    { errors: [{ message: "denied" }], data: { activeSubscription: null } },
    {},
    { data: {} },
  ]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(fetchActiveSubscription("gid://shopify/Shop/789"));
  }
});
test("HTTP and transport errors cannot become a free or inactive subscription", async () => {
  configure();
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(fetchActiveSubscription("gid://shopify/Shop/789"));
  globalThis.fetch = async () => {
    throw new Error("Network unavailable");
  };
  await assert.rejects(fetchActiveSubscription("gid://shopify/Shop/789"));
});
