export const UNLIMITED = null;

export type PlanEntitlements = {
  comparisonProductLimit: number | null;
  productFinderLimit: number | null;
  finderQuestionLimit: number | null;
  metafields: boolean;
  advancedCustomization: boolean;
  analytics: boolean;
  smartBadges: boolean;
  advancedInsights: boolean;
};

const freeEntitlements = {
  comparisonProductLimit: 2,
  productFinderLimit: 1,
  finderQuestionLimit: 2,
  metafields: false,
  advancedCustomization: false,
  analytics: false,
  smartBadges: false,
  advancedInsights: false,
} as const satisfies PlanEntitlements;

const growthEntitlements = {
  ...freeEntitlements,
  comparisonProductLimit: 10,
  productFinderLimit: UNLIMITED,
  finderQuestionLimit: UNLIMITED,
  metafields: true,
  advancedCustomization: true,
} as const satisfies PlanEntitlements;

export const PLAN_ENTITLEMENTS = {
  free: freeEntitlements,
  growth: growthEntitlements,
  pro: {
    ...growthEntitlements,
    analytics: true,
    smartBadges: true,
    advancedInsights: true,
  },
} as const satisfies Record<string, PlanEntitlements>;

export type PlanKey = keyof typeof PLAN_ENTITLEMENTS;
export type GatedFeature = {
  [Key in keyof PlanEntitlements]: PlanEntitlements[Key] extends boolean
    ? Key
    : never;
}[keyof PlanEntitlements];

export function isPlanKey(value: string | null): value is PlanKey {
  return value !== null && value in PLAN_ENTITLEMENTS;
}

export function effectivePlanKey(subscription: {
  status: string;
  planKey: string | null;
} | null): PlanKey {
  return subscription?.status === "ACTIVE" && isPlanKey(subscription.planKey)
    ? subscription.planKey
    : "free";
}

export function effectiveAccessPlan(
  subscription: Parameters<typeof effectivePlanKey>[0],
): PlanKey {
  return effectivePlanKey(subscription);
}

export function getPlanEntitlements(plan: PlanKey): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function getAccessEntitlements(
  plan: PlanKey,
): PlanEntitlements {
  return getPlanEntitlements(plan);
}

export function canUseFeature(plan: PlanKey, feature: GatedFeature): boolean {
  return getPlanEntitlements(plan)[feature];
}

export function getProductFinderLimit(plan: PlanKey): number | null {
  return getPlanEntitlements(plan).productFinderLimit;
}

export function getComparisonProductLimit(plan: PlanKey): number | null {
  return getPlanEntitlements(plan).comparisonProductLimit;
}

export function getFinderQuestionLimit(plan: PlanKey): number | null {
  return getPlanEntitlements(plan).finderQuestionLimit;
}
