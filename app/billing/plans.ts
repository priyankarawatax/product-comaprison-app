import {
  PLAN_ENTITLEMENTS,
  type PlanEntitlements,
  type PlanKey,
} from "./entitlements";

export type { PlanEntitlements, PlanKey } from "./entitlements";

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  monthly: number;
  yearly: number;
  yearlySavings: number;
  trialDays: number;
  popular: boolean;
  features: readonly string[];
  entitlements: PlanEntitlements;
};

export const PLANS = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    yearlySavings: 0,
    trialDays: 0,
    popular: false,
    features: [
      "Compare up to 2 products",
      "1 Product Finder",
      "Maximum 2 Product Finder questions",
      "Basic comparison settings",
      "Basic storefront customization",
    ],
    entitlements: PLAN_ENTITLEMENTS.free,
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 4.99,
    yearly: 49.9,
    yearlySavings: 9.98,
    trialDays: 5,
    popular: true,
    features: [
      "Everything in Free",
      "Unlimited Product Finders",
      "Unlimited Product Finder questions",
      "Product metafields in comparison",
      "Advanced comparison customization",
      "Advanced Product Finder customization",
      "Custom button/modal styling",
    ],
    entitlements: PLAN_ENTITLEMENTS.growth,
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 9.99,
    yearly: 99.9,
    yearlySavings: 19.98,
    trialDays: 5,
    popular: false,
    features: [
      "Everything in Growth",
      "Analytics Dashboard",
      "Smart Comparison Badges",
      "Advanced comparison insights",
      "Most compared products",
      "Most compared product pairs",
      "Comparison interaction analytics",
    ],
    entitlements: PLAN_ENTITLEMENTS.pro,
  },
] as const satisfies readonly PlanDefinition[];

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount === 0 ? 0 : 2,
  }).format(amount);
}

export function planActionLabel(
  plan: PlanDefinition,
  currentPlanKey: PlanKey,
  currentBillingInterval: BillingInterval | null,
  selectedInterval: BillingInterval,
  cancelAtEndOfCycle = false,
  billingSelectionRequired = false,
) {
  if (billingSelectionRequired) return `Select ${plan.name}`;
  if (plan.key === currentPlanKey) {
    if (plan.key === "free") return "Current plan";
    if (currentBillingInterval === selectedInterval) {
      return cancelAtEndOfCycle ? `Reactivate ${plan.name}` : "Current plan";
    }
    return `Switch to ${selectedInterval}`;
  }
  if (plan.key === "free") return "Downgrade to Free";
  if (currentPlanKey === "free") return `Start ${plan.trialDays}-day free trial`;
  if (plan.key === "pro") return "Upgrade to Pro";
  return "Switch to Growth";
}

export function formatBillingDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}
