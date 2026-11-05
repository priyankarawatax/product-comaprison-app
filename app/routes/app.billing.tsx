import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { type PlanKey } from "../billing/entitlements";
import { loadBilling } from "../billing/billing.server";
import { pricingPlanUrl } from "../billing/partner.server";
import {
  BILLING_INTERVALS,
  PLANS,
  formatUsd,
  type BillingInterval,
  type PlanDefinition,
} from "../billing/plans";
import "../styles/billing.css";

const PLAN_SUBTITLES: Record<PlanKey, string> = {
  free: "Great for getting started",
  growth: "For growing stores",
  pro: "For high-growth stores",
};

const COMPARISON_ROWS = [
  ["Product comparison", true, true, true],
  ["Products per comparison", "Up to 2", "Up to 10", "Up to 10"],
  ["Product Finders", "1", "Unlimited", "Unlimited"],
  ["Finder questions per finder", "Up to 2", "Unlimited", "Unlimited"],
  ["Product metafields in comparison", false, true, true],
  ["Advanced comparison customization", false, true, true],
  ["Advanced Product Finder customization", false, true, true],
  ["Custom button/modal styling", false, true, true],
  ["Analytics dashboard", false, false, true],
  ["Smart Comparison Badges", false, false, true],
  ["Advanced comparison insights", false, false, true],
  ["Most compared products", false, false, true],
  ["Most compared product pairs", false, false, true],
  ["Comparison interaction analytics", false, false, true],
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  let currentPlanKey: PlanKey = "free";
  let currentBillingInterval: BillingInterval | null = null;
  let verificationError = null;
  try {
    const { subscription, accessPlan } = await loadBilling(admin, session.shop);
    currentPlanKey = accessPlan;
    currentBillingInterval =
      subscription?.status === "ACTIVE" && subscription.billingPeriod === "ANNUAL"
        ? "yearly"
        : subscription?.status === "ACTIVE" &&
            subscription.billingPeriod === "EVERY_30_DAYS"
          ? "monthly"
          : null;
  } catch {
    verificationError =
      "We could not verify your current subscription. Plan access is temporarily limited to Free until verification succeeds.";
  }
  return {
    currentPlanKey,
    currentBillingInterval,
    verificationError,
    freePlanUrl: pricingPlanUrl(session.shop, "free", "EVERY_30_DAYS"),
    growthPlanUrls: {
      monthly: pricingPlanUrl(session.shop, "starter", "EVERY_30_DAYS"),
      yearly: pricingPlanUrl(session.shop, "starter", "ANNUAL"),
    },
    proPlanUrls: {
      monthly: pricingPlanUrl(session.shop, "growth", "EVERY_30_DAYS"),
      yearly: pricingPlanUrl(session.shop, "growth", "ANNUAL"),
    },
  };
}

function planActionLabel(
  plan: PlanDefinition,
  currentPlanKey: PlanKey,
  currentBillingInterval: BillingInterval | null,
  selectedInterval: BillingInterval,
) {
  if (plan.key === currentPlanKey) {
    if (plan.key === "free" || currentBillingInterval === selectedInterval) {
      return "Current plan";
    }
    return `Switch to ${selectedInterval}`;
  }
  if (plan.key === "free") return "Downgrade to Free";
  if (currentPlanKey === "free") return `Start ${plan.trialDays}-day free trial`;
  if (plan.key === "pro") return "Upgrade to Pro";
  return "Switch to Growth";
}

function ComparisonValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span className="billing-check billing-check--center" aria-label="Included">✓</span>;
  }
  if (value === false) {
    return <span className="billing-not-included" aria-label="Not included">—</span>;
  }
  return <span>{value}</span>;
}

export default function BillingPage() {
  const {
    currentPlanKey,
    currentBillingInterval,
    verificationError,
    freePlanUrl,
    growthPlanUrls,
    proPlanUrls,
  } = useLoaderData<typeof loader>();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const currentPlan = PLANS.find((plan) => plan.key === currentPlanKey) ?? PLANS[0];
  const currentPlanInterval = currentBillingInterval ?? "monthly";
  const currentPlanPrice = currentPlan[currentPlanInterval];

  return (
    <s-page heading="Plans & billing" inlineSize="large">
      <s-stack gap="base">

        {verificationError && <s-banner tone="warning">{verificationError}</s-banner>}

        <div className="billing-header">
          <s-stack>
            <s-heading fontSize="large-300" >Plans & billing</s-heading>
            <s-heading>Choose the plan that fits your store.</s-heading>
            <s-paragraph>Upgrade or change your plan anytime.</s-paragraph>
          </s-stack>

          <div className="billing-current-plan-card">
            <s-box borderRadius="base" padding="small">
              <div className="billing-current-plan">
                <span className="billing-current-plan__mark" aria-hidden="true">✓</span>
                <s-stack>
                  <s-text color="subdued">Current plan</s-text>
                  <s-heading>{currentPlan.name}</s-heading>
                  <s-text color="subdued">
                    {currentPlan.key === "free"
                      ? "You are on the Free plan."
                      : `${formatUsd(currentPlanPrice)} / ${
                          currentPlanInterval === "monthly" ? "month" : "year"
                        }`}
                  </s-text>
                </s-stack>
              </div>
            </s-box>
          </div>
        </div>

        

        <div className="billing-interval" role="group" aria-label="Billing interval">
          {BILLING_INTERVALS.map((value) => (
            <button
              key={value}
              type="button"
              className={`billing-interval__button${interval === value ? " is-active" : ""}`}
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
            >
              {value === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
          <span className="billing-interval__saving">Save 2 months</span>
        </div>

        <div className="billing-plan-grid">
          {PLANS.map((plan) => {
            const price = plan[interval];
            const isCurrentPlan = currentPlanKey === plan.key;
            const isExactCurrent =
              isCurrentPlan &&
              (plan.key === "free" || currentBillingInterval === interval);
            const actionLabel = planActionLabel(
              plan,
              currentPlanKey,
              currentBillingInterval,
              interval,
            );

            return (
              <div
                key={plan.key}
                className={`billing-plan-card${plan.popular ? " billing-plan-card--popular" : ""}${isCurrentPlan ? " billing-plan-card--current" : ""}`}
                aria-current={isCurrentPlan ? "true" : undefined}
              >
                {plan.popular && (
                  <span className="billing-plan-card__popular">Most Popular</span>
                )}

                <div className="billing-plan-card__content">
                  <s-stack >
                    <s-heading fontSize="large-100">{plan.name}</s-heading>
                    <s-text color="subdued">
                      {PLAN_SUBTITLES[plan.key]}
                    </s-text>
                  </s-stack>

                  <div className="billing-price">
                    <span className="billing-price__amount">{formatUsd(price)}</span>
                    <span className="billing-price__interval">
                      / {interval === "monthly" ? "month" : "year"}
                    </span>
                  </div>

                  <div className="billing-plan-card__meta">
                    {interval === "yearly" && plan.yearlySavings > 0 && (
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <s-badge tone="success">Save {formatUsd(plan.yearlySavings)}</s-badge>
                        <s-text color="subdued">2 months free</s-text>
                      </s-stack>
                    )}

                    {plan.trialDays > 0 && (
                      <s-stack gap="base">
                        <s-badge tone="info">{plan.trialDays}-day free trial</s-badge>
                      </s-stack>
                    )}
                  </div>

                  <ul className="billing-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <span className="billing-check" aria-hidden="true">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="billing-plan-card__action">
                    {isExactCurrent ? (
                      <s-button disabled>{actionLabel}</s-button>
                    ) : plan.key === "free" ? (
                      <s-button commandFor="downgrade-free-modal" command="--show">
                        {actionLabel}
                      </s-button>
                    ) : plan.popular ? (
                      <a
                        className="billing-plan-card__popular-action"
                        href={growthPlanUrls[interval]}
                        target="_top"
                      >
                        {actionLabel}
                      </a>
                    ) : (
                      <s-button
                        href={proPlanUrls[interval]}
                        target="_top"
                        variant="secondary"
                      >
                        {actionLabel}
                      </s-button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <s-section>
          <s-stack gap="base">
            <s-stack gap="small">
              <s-heading>Compare plans</s-heading>
              <s-paragraph>See what&apos;s included in each plan.</s-paragraph>
            </s-stack>
            <div className="billing-comparison">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Features</th>
                    <th scope="col">Free</th>
                    <th scope="col">Growth</th>
                    <th scope="col">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map(([feature, free, growth, pro]) => (
                    <tr key={feature}>
                      <th scope="row">{feature}</th>
                      <td><ComparisonValue value={free} /></td>
                      <td><ComparisonValue value={growth} /></td>
                      <td><ComparisonValue value={pro} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </s-stack>
        </s-section>

        <s-modal id="downgrade-free-modal" heading="Downgrade to Free?">
          <s-paragraph>
            You may lose access to paid features. Your existing data will not be
            deleted, but paid features will become unavailable.
          </s-paragraph>
          <s-button
            slot="primary-action"
            href={freePlanUrl}
            target="_top"
            variant="primary"
            tone="critical"
          >
            Continue to downgrade
          </s-button>
          <s-button
            slot="secondary-actions"
            commandFor="downgrade-free-modal"
            command="--hide"
          >
            Cancel
          </s-button>
        </s-modal>
      </s-stack>
    </s-page>
  );
}
