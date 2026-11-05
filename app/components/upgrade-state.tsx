import type { PlanKey } from "../billing/entitlements";

const planNames: Record<PlanKey, string> = {
  free: "Free",
  growth: "Growth",
  pro: "Pro",
};

export function UpgradeState({
  heading,
  message,
  requiredPlan,
}: {
  heading: string;
  message: string;
  requiredPlan: Exclude<PlanKey, "free">;
}) {
  return (
    <s-section heading={heading}>
      <s-stack gap="base">
        <s-banner tone="info">{message}</s-banner>
        <s-button href="/app/billing" variant="primary">
          Upgrade to {planNames[requiredPlan]}
        </s-button>
      </s-stack>
    </s-section>
  );
}
