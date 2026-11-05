import { useState } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { useFetcher } from "react-router";
import { ComparisonRowList } from "./comparison-row-list";
import type { ComparisonMetafield } from "../comparison-rows";
import type { action } from "../routes/app.table-settings";
import type { ReviewSettings } from "../review-settings";

type RowSettings = {
  fields: ComparisonMetafield[];
  order: string[];
  disabled: string[];
  labels: Record<string, string>;
  reviewSettings: ReviewSettings;
};

export function DashboardComparisonRows({ initial }: { initial: RowSettings }) {
  const fetcher = useFetcher<typeof action>();
  const [order, setOrder] = useState(initial.order);
  const [disabled, setDisabled] = useState(initial.disabled);
  const saving = fetcher.state !== "idle";
  const saved = fetcher.data?.success ? fetcher.data : initial;
  const dirty = JSON.stringify(order) !== JSON.stringify(saved.order)
    || JSON.stringify([...disabled].sort()) !== JSON.stringify([...(saved.disabled || [])].sort());

  return (
    <>
      <SaveBar id="dashboard-comparison-table-save-bar" open={dirty || saving}>
        <button variant="primary" disabled={saving} onClick={() => {
          void fetcher.submit({
            order: JSON.stringify(order),
            disabled: JSON.stringify(disabled),
            fields: JSON.stringify(initial.fields),
            labels: JSON.stringify(initial.labels),
            reviewSettings: JSON.stringify(initial.reviewSettings),
          }, { method: "post", action: "/app/table-settings" });
        }}>Save</button>
        <button disabled={saving} onClick={() => {
          setOrder([...(saved.order || initial.order)]);
          setDisabled([...(saved.disabled || [])]);
        }}>Discard</button>
      </SaveBar>
      <s-section heading="">
        <s-heading fontSize="base">Comparison table rows</s-heading>
        <s-stack gap="base">
          <s-paragraph>Drag the handle to reorder rows. Turn off rows you do not want to show. Use Save in the Shopify header to apply changes, then refresh the storefront. You can also focus a handle and use the arrow keys.</s-paragraph>
          {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
          {fetcher.data?.success && !dirty && <s-banner tone="success">Table settings saved.</s-banner>}
          <ComparisonRowList customRows={initial.fields} order={order} disabledRows={disabled} labels={initial.labels} saving={saving} onOrderChange={setOrder} onDisabledChange={setDisabled} />
        </s-stack>
      </s-section>
    </>
  );
}
