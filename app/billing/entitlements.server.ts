import db from "../db.server";
import {
  effectivePlanKey,
  getPlanEntitlements,
  type PlanEntitlements,
  type PlanKey,
} from "./entitlements";
import { syncSubscription } from "./billing.server";

export type StorePlanAccess = {
  plan: PlanKey;
  entitlements: PlanEntitlements;
};

export const PLAN_SYNC_MAX_AGE_MS = 5 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 1000;
const refreshes = new Map<bigint, ReturnType<typeof syncSubscription>>();
const retryAfter = new Map<bigint, number>();

async function refreshSubscription(store: { id: bigint; shopifyId: string; shop: string }) {
  const existing = refreshes.get(store.id);
  if (existing) return existing;
  const refresh = syncSubscription(store).finally(() => refreshes.delete(store.id));
  refreshes.set(store.id, refresh);
  return refresh;
}

export async function getStorePlanAccess(shop: string): Promise<StorePlanAccess> {
  const store = await db.store.findUnique({
    where: { shop },
    select: {
      id: true,
      shopifyId: true,
      shop: true,
      uninstalledAt: true,
      subscription: { select: { status: true, planKey: true, syncedAt: true } },
    },
  });
  if (!store || store.uninstalledAt) {
    return { plan: "free", entitlements: getPlanEntitlements("free") };
  }
  let subscription = store.subscription;
  const stale = !subscription || Date.now() - subscription.syncedAt.getTime() > PLAN_SYNC_MAX_AGE_MS;
  if (stale && (retryAfter.get(store.id) ?? 0) <= Date.now()) {
    try {
      subscription = await refreshSubscription(store);
      retryAfter.delete(store.id);
    } catch {
      retryAfter.set(store.id, Date.now() + RETRY_AFTER_FAILURE_MS);
      return { plan: "free", entitlements: getPlanEntitlements("free") };
    }
  } else if (stale) {
    return { plan: "free", entitlements: getPlanEntitlements("free") };
  }
  const plan = effectivePlanKey(subscription);
  return { plan, entitlements: getPlanEntitlements(plan) };
}
