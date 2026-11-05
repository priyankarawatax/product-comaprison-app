import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAccessPlan,
  PLAN_ENTITLEMENTS,
  canUseFeature,
  getComparisonProductLimit,
  getFinderQuestionLimit,
  effectivePlanKey,
  getPlanEntitlements,
  getProductFinderLimit,
} from "../app/billing/entitlements";
import { BILLING_INTERVALS, PLANS } from "../app/billing/plans";

test("billing intervals and plan prices match the public offer", () => {
  assert.deepEqual(BILLING_INTERVALS, ["monthly", "yearly"]);
  assert.deepEqual(
    PLANS.map(({ key, monthly, yearly, trialDays }) => ({
      key,
      monthly,
      yearly,
      trialDays,
    })),
    [
      { key: "free", monthly: 0, yearly: 0, trialDays: 0 },
      { key: "growth", monthly: 4.99, yearly: 49.9, trialDays: 5 },
      { key: "pro", monthly: 9.99, yearly: 99.9, trialDays: 5 },
    ],
  );
});

test("entitlements inherit limits and enable paid capabilities centrally", () => {
  assert.equal(PLAN_ENTITLEMENTS.free.comparisonProductLimit, 2);
  assert.equal(PLAN_ENTITLEMENTS.free.productFinderLimit, 1);
  assert.equal(PLAN_ENTITLEMENTS.free.finderQuestionLimit, 2);
  assert.equal(PLAN_ENTITLEMENTS.growth.productFinderLimit, null);
  assert.equal(PLAN_ENTITLEMENTS.growth.finderQuestionLimit, null);
  assert.equal(PLAN_ENTITLEMENTS.growth.comparisonProductLimit, 10);
  assert.equal(PLAN_ENTITLEMENTS.growth.metafields, true);
  assert.equal(PLAN_ENTITLEMENTS.growth.analytics, false);
  assert.equal(PLAN_ENTITLEMENTS.pro.analytics, true);
  assert.equal(PLAN_ENTITLEMENTS.pro.smartBadges, true);
  assert.equal(PLAN_ENTITLEMENTS.pro.advancedInsights, true);
});

test("central helpers fail closed by plan and expose limits", () => {
  assert.equal(canUseFeature("free", "metafields"), false);
  assert.equal(canUseFeature("growth", "metafields"), true);
  assert.equal(canUseFeature("growth", "analytics"), false);
  assert.equal(canUseFeature("pro", "analytics"), true);
  assert.equal(getProductFinderLimit("free"), 1);
  assert.equal(getComparisonProductLimit("free"), 2);
  assert.equal(getComparisonProductLimit("growth"), 10);
  assert.equal(getProductFinderLimit("growth"), null);
  assert.equal(getFinderQuestionLimit("free"), 2);
  assert.equal(getPlanEntitlements("pro"), PLAN_ENTITLEMENTS.pro);
  assert.equal(effectivePlanKey({ status: "ACTIVE", planKey: "growth" }), "growth");
  assert.equal(effectivePlanKey({ status: "INACTIVE", planKey: "pro" }), "free");
  assert.equal(effectivePlanKey({ status: "ACTIVE", planKey: "unknown" }), "free");
  assert.equal(effectivePlanKey(null), "free");
  assert.equal(effectiveAccessPlan(null), "free");
  assert.equal(
    effectiveAccessPlan({ status: "ACTIVE", planKey: "growth" }),
    "growth",
  );
  assert.equal(
    effectiveAccessPlan({ status: "ACTIVE", planKey: "pro" }),
    "pro",
  );
});
