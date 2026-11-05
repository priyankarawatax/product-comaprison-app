import { PLANS, type PlanKey } from "./plans";
import type { ActiveSubscription } from "./partner.server";

export function resolveSubscription(
  subscription: ActiveSubscription | null,
  handles: Record<PlanKey, string>,
) {
  if (!subscription) return null;
  // Match a verified item handle, never the return URL or price ($0 is also used by dev stores).
  const matches = subscription.items.flatMap((item) => {
    const plan = PLANS.find(
      (candidate) => handles[candidate.key] === item.handle,
    );
    // activeSubscription already represents the shop's current contract.
    // Price.active describes whether that catalog price is still offered; it
    // can be false for an existing contract after Shopify updates the price.
    return plan && item.price.__typename === "FlatRatePrice"
      ? [{ plan, item }]
      : [];
  });
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (
    match.plan.key !== "free" &&
    !["EVERY_30_DAYS", "ANNUAL"].includes(subscription.billingPeriod ?? "")
  )
    return null;
  return match;
}
