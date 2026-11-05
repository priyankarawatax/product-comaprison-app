import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useNavigate, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalyticsSummary, getComparisonActivity, getMostComparedProducts, getMostComparedTogether, getProductFinderActivity } from "../analytics/analytics.server";
import { ComparisonActivityChart } from "../components/comparison-activity-chart";
import { ProductFinderActivityChart } from "../components/product-finder-activity-chart";
import { FeatureRequestButton } from "../components/feature-request";
import { UpgradeState } from "../components/upgrade-state";
import { getStorePlanAccess } from "../billing/entitlements.server";

type DatePresetKey = "today" | "yesterday" | "last7" | "last30" | "last90" | "monthToDate" | "yearToDate" | "custom";
type DatePreset = { key: DatePresetKey; label: string; start: string; end: string };

const formatUTCDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const addUTCDays = (date: Date, days: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
const validDateOnly = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));

function buildDatePresets(today: Date): DatePreset[] {
  const end = formatUTCDate(today);
  return [
    { key: "today", label: "Today", start: end, end },
    { key: "yesterday", label: "Yesterday", start: formatUTCDate(addUTCDays(today, -1)), end: formatUTCDate(addUTCDays(today, -1)) },
    { key: "last7", label: "Last 7 days", start: formatUTCDate(addUTCDays(today, -6)), end },
    { key: "last30", label: "Last 30 days", start: formatUTCDate(addUTCDays(today, -29)), end },
    { key: "last90", label: "Last 90 days", start: formatUTCDate(addUTCDays(today, -89)), end },
    { key: "monthToDate", label: "Month to date", start: formatUTCDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), end },
    { key: "yearToDate", label: "Year to date", start: `${today.getUTCFullYear()}-01-01`, end },
  ];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const access = await getStorePlanAccess(session.shop);
  if (!access.entitlements.analytics) return { locked: true as const };
  const url = new URL(request.url);
  const parsePage = (name: string) => {
    const value = Number(url.searchParams.get(name));
    return Number.isInteger(value) && value > 0 ? Math.min(value, 100_000) : 1;
  };
  const requestedProductsPage = parsePage("productsPage");
  const requestedPairsPage = parsePage("pairsPage");
  const today = new Date();
  const presets = buildDatePresets(today);
  const requestedPreset = url.searchParams.get("preset") as DatePresetKey | null;
  const requestedStart = url.searchParams.get("start");
  const requestedEnd = url.searchParams.get("end");
  const legacyDays = Number(url.searchParams.get("days"));
  const legacyPreset = legacyDays === 7 ? "last7" : legacyDays === 90 ? "last90" : "last30";
  const matchingPreset = presets.find((item) => item.key === requestedPreset);
  const hasCustomRange = validDateOnly(requestedStart) && validDateOnly(requestedEnd) && requestedStart! <= requestedEnd!;
  const selected = matchingPreset || (hasCustomRange ? { key: "custom" as const, label: "Custom range", start: requestedStart!, end: requestedEnd! } : presets.find((item) => item.key === legacyPreset)!);
  const startDate = new Date(`${selected.start}T00:00:00.000Z`);
  const inclusiveEndDate = new Date(`${selected.end}T00:00:00.000Z`);
  const maximumEndDate = addUTCDays(startDate, 366);
  const safeEndDate = inclusiveEndDate > maximumEndDate ? maximumEndDate : inclusiveEndDate;
  const endDate = addUTCDays(safeEndDate, 1);
  const [summary, activity, finderActivity, productResult, pairResult] = await Promise.all([
    getAnalyticsSummary(session.shop, startDate, endDate),
    getComparisonActivity(session.shop, startDate, endDate),
    getProductFinderActivity(session.shop, startDate, endDate),
    getMostComparedProducts(session.shop, startDate, endDate, requestedProductsPage),
    getMostComparedTogether(session.shop, startDate, endDate, requestedPairsPage),
  ]);
  const finderClicks = finderActivity.reduce((total, day) => total + day.clicks, 0);
  const products = productResult.items;
  const pairs = pairResult.items;
  const ids = [...new Set([...products.map((product) => product.productId), ...pairs.flatMap((pair) => [pair.productA, pair.productB])])];
  const titles: Record<string, string> = {};
  let productLookupFailed = false;
  // At most one lookup of the displayed products; no API calls on empty reports.
  if (ids.length) {
    try {
      const response = await admin.graphql(`#graphql
        query AnalyticsProductTitles($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { id title } }
        }
      `, { variables: { ids: ids.map((id) => `gid://shopify/Product/${id}`) } });
      const result = await response.json();
      if ("errors" in result && result.errors) productLookupFailed = true;
      for (const node of result.data?.nodes || []) {
        if (node && "id" in node && "title" in node) titles[node.id.split("/").pop()!] = node.title;
      }
    } catch { productLookupFailed = true; }
  }
  return { locked: false as const, start: selected.start, end: formatUTCDate(safeEndDate), preset: selected.key, rangeLabel: selected.key === "custom" ? `${selected.start} – ${formatUTCDate(safeEndDate)}` : selected.label, presets, summary, activity, finderActivity, finderClicks, products, pairs, productsPagination: { page: productResult.page, total: productResult.total, totalPages: productResult.totalPages }, pairsPagination: { page: pairResult.page, total: pairResult.total, totalPages: pairResult.totalPages }, titles, productLookupFailed };
}

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  if (data.locked) {
    return (
      <s-page heading="Analytics">
        <UpgradeState
          heading="Unlock Analytics"
          message="Analytics is available on the Pro plan."
          requiredPlan="pro"
        />
      </s-page>
    );
  }
  return <AnalyticsDashboard data={data} />;
}

function AnalyticsDashboard({ data }: { data: Extract<Awaited<ReturnType<typeof loader>>, { locked: false }> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";
  const [draftRange, setDraftRange] = useState(`${data.start}--${data.end}`);
  useEffect(() => { setDraftRange(`${data.start}--${data.end}`); }, [data.start, data.end]);
  const [draftStart = "", draftEnd = ""] = draftRange.split("--");
  const applyRange = (start: string, end: string, preset: DatePresetKey = "custom") => {
    const params = new URLSearchParams({ start, end, preset });
    void navigate(`?${params.toString()}`);
  };
  const pageUrl = (name: "productsPage" | "pairsPage", page: number) => {
    const params = new URLSearchParams(location.search);
    params.set(name, String(page));
    return `${location.pathname}?${params.toString()}`;
  };
  const title = (id: string) => data.titles[id] || `Product #${id}`;
  const metrics = [
    { label: "Comparison opens", value: data.summary.opens.toLocaleString(), detail: "Times customers opened the comparison table", backgroundColor: "#eaf3ff" },
    { label: "Products compared", value: data.summary.added.toLocaleString(), detail: "Products added to a comparison list", backgroundColor: "#f3edff" },
    { label: "Add to Cart", value: data.summary.cart.toLocaleString(), detail: "Add to Cart clicks from the comparison table", backgroundColor: "#e8f7ee" },
    { label: "Conversion rate", value: `${data.summary.conversionRate.toFixed(1)}%`, detail: "Add to Cart clicks per comparison open", backgroundColor: "#fff3dc" },
    { label: "Find my product clicks", value: data.finderClicks.toLocaleString(), detail: "Times customers opened the Product Finder quiz", backgroundColor: "#f3edff" },
  ];
  return (
    <s-page heading="Analytics" inlineSize="large">
      <FeatureRequestButton />
      <s-stack gap="large">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button icon="calendar" commandFor="analytics-date-filter" disabled={loading} loading={loading}>{data.rangeLabel}</s-button>
          <s-popover id="analytics-date-filter" inlineSize="680px">
            <s-box padding="base">
              <s-grid gridTemplateColumns="160px minmax(0, 1fr)" gap="base" alignItems="start">
                <s-stack gap="small">
                  {data.presets.map((preset) => (
                    <s-button
                      key={preset.key}
                      variant={data.preset === preset.key ? "primary" : "tertiary"}
                      commandFor="analytics-date-filter"
                      command="--hide"
                      onClick={() => applyRange(preset.start, preset.end, preset.key)}
                    >{preset.label}</s-button>
                  ))}
                  <s-divider />
                  <s-button variant={data.preset === "custom" ? "primary" : "tertiary"}>Custom range</s-button>
                </s-stack>
                <s-stack gap="base">
                  <s-grid gridTemplateColumns="1fr auto 1fr" gap="small" alignItems="center">
                    <s-date-field label="Start date" value={draftStart} onChange={(event) => setDraftRange(`${event.currentTarget.value}--${draftEnd}`)} />
                    <s-text>→</s-text>
                    <s-date-field label="End date" value={draftEnd} onChange={(event) => setDraftRange(`${draftStart}--${event.currentTarget.value}`)} />
                  </s-grid>
                  <s-date-picker
                    type="range"
                    value={draftRange}
                    view={draftEnd.slice(0, 7)}
                    onChange={(event) => setDraftRange(event.currentTarget.value)}
                  />
                  <s-stack direction="inline" gap="small" justifyContent="end">
                    <s-button commandFor="analytics-date-filter" command="--hide" onClick={() => setDraftRange(`${data.start}--${data.end}`)}>Cancel</s-button>
                    <s-button
                      variant="primary"
                      disabled={!validDateOnly(draftStart) || !validDateOnly(draftEnd) || draftStart > draftEnd}
                      commandFor="analytics-date-filter"
                      command="--hide"
                      onClick={() => applyRange(draftStart, draftEnd)}
                    >Apply</s-button>
                  </s-stack>
                </s-stack>
              </s-grid>
            </s-box>
          </s-popover>
        </s-stack>

        {!data.summary.total && !data.finderClicks ? (
          <s-section>
            <s-box padding="large" background="subdued" borderRadius="base">
              <s-stack gap="base" alignItems="center">
                <s-badge tone="info">Getting started</s-badge>
                <s-heading>No comparison activity yet</s-heading>
                <s-paragraph>Analytics will appear when customers start using product comparison. No activity was recorded in this date range.</s-paragraph>
                <s-button href="/app" variant="primary">View dashboard</s-button>
              </s-stack>
            </s-box>
          </s-section>
        ) : (
          <>
            <s-stack gap="base">
              <s-heading>Performance overview</s-heading>
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    style={{ backgroundColor: metric.backgroundColor, borderRadius: "8px" }}
                  >
                    <s-box  borderRadius="base" padding="base">
                      <s-stack gap="base">
                        <s-text color="subdued">{metric.label}</s-text>
                        <s-heading fontSize="large-400">{metric.value}</s-heading>
                        <s-divider />
                        <s-text color="subdued">{metric.detail}</s-text>
                      </s-stack>
                    </s-box>
                  </div>
                ))}
              </s-grid>
            </s-stack>

            <s-section heading="Comparison activity">
              <s-stack gap="base">
                <s-stack direction="inline" gap="small">
                  <s-badge tone="info">{data.summary.opens.toLocaleString()} comparison opens</s-badge>
                  <s-badge tone="success">{data.summary.cart.toLocaleString()} Add to Cart clicks</s-badge>
                </s-stack>
                {data.summary.opens || data.summary.cart ? (
                  <ComparisonActivityChart days={data.activity} />
                ) : (
                  <s-box padding="large" background="subdued" borderRadius="base">
                    <s-paragraph>No comparison opens or Add to Cart clicks in this date range.</s-paragraph>
                  </s-box>
                )}
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-stack gap="small">
                    <s-heading>How conversion is measured</s-heading>
                    <s-paragraph>Add to Cart clicks ÷ comparison opens × 100. This measures clicks, not completed purchases. It can exceed 100% when customers add several products per comparison.</s-paragraph>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-section>

            <s-section heading="Product Finder activity">
              <s-stack gap="base">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-badge tone="info">{data.finderClicks.toLocaleString()} Find my product clicks</s-badge>
                  <s-text color="subdued">Button clicks in the selected date range</s-text>
                </s-stack>
                <ProductFinderActivityChart days={data.finderActivity} />
                {!data.finderClicks && <s-box padding="base" background="subdued" borderRadius="base">
                  <s-paragraph>No Product Finder button clicks were recorded in this date range.</s-paragraph>
                </s-box>}
              </s-stack>
            </s-section>

            {data.productLookupFailed && <s-banner tone="warning">Some product names could not be loaded. Analytics counts are still available.</s-banner>}

            <s-grid gridTemplateColumns="@container (inline-size <= 900px) 1fr, 1fr 1fr" gap="base" alignItems="start">
              <s-section heading="Most compared products">
                <s-stack gap="base">
                  <s-paragraph>Discover the products customers add to comparison most often.</s-paragraph>
                  {data.productsPagination.total > 0 && <s-text color="subdued">Showing {(data.productsPagination.page - 1) * 10 + 1}–{Math.min(data.productsPagination.page * 10, data.productsPagination.total)} of {data.productsPagination.total}</s-text>}
                  {data.products.length ? (
                    <s-table
                      paginate={data.productsPagination.totalPages > 1}
                      hasPreviousPage={data.productsPagination.page > 1}
                      hasNextPage={data.productsPagination.page < data.productsPagination.totalPages}
                      onPreviousPage={() => { void navigate(pageUrl("productsPage", data.productsPagination.page - 1)); }}
                      onNextPage={() => { void navigate(pageUrl("productsPage", data.productsPagination.page + 1)); }}
                    >
                      <s-table-header-row>
                        <s-table-header>Product</s-table-header>
                        <s-table-header format="numeric">Times compared</s-table-header>
                        <s-table-header format="numeric">Add to Cart clicks</s-table-header>
                      </s-table-header-row>
                      <s-table-body>
                        {data.products.map((product, index) => (
                          <s-table-row key={product.productId}>
                            <s-table-cell>
                              <s-stack direction="inline" gap="small" alignItems="center">
                                <s-badge>#{(data.productsPagination.page - 1) * 10 + index + 1}</s-badge>
                                <s-text>{title(product.productId)}</s-text>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>{product.added.toLocaleString()}</s-table-cell>
                            <s-table-cell>{product.cart.toLocaleString()}</s-table-cell>
                          </s-table-row>
                        ))}
                      </s-table-body>
                    </s-table>
                  ) : (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-paragraph>No products added to comparison in this date range.</s-paragraph>
                    </s-box>
                  )}
                </s-stack>
              </s-section>

              <s-section heading="Most compared together">
                <s-stack gap="base">
                  <s-paragraph>See which product pairs customers consider side by side.</s-paragraph>
                  {data.pairsPagination.total > 0 && <s-text color="subdued">Showing {(data.pairsPagination.page - 1) * 10 + 1}–{Math.min(data.pairsPagination.page * 10, data.pairsPagination.total)} of {data.pairsPagination.total}</s-text>}
                  {data.pairs.length ? (
                    <s-table
                      paginate={data.pairsPagination.totalPages > 1}
                      hasPreviousPage={data.pairsPagination.page > 1}
                      hasNextPage={data.pairsPagination.page < data.pairsPagination.totalPages}
                      onPreviousPage={() => { void navigate(pageUrl("pairsPage", data.pairsPagination.page - 1)); }}
                      onNextPage={() => { void navigate(pageUrl("pairsPage", data.pairsPagination.page + 1)); }}
                    >
                      <s-table-header-row>
                        <s-table-header>Product pair</s-table-header>
                        <s-table-header format="numeric">Comparisons</s-table-header>
                      </s-table-header-row>
                      <s-table-body>
                        {data.pairs.map((pair) => (
                          <s-table-row key={`${pair.productA}:${pair.productB}`}>
                            <s-table-cell>
                              <s-stack gap="small-300">
                                <s-text>{title(pair.productA)}</s-text>
                                <s-text color="subdued">+ {title(pair.productB)}</s-text>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>{pair.comparisons.toLocaleString()}</s-table-cell>
                          </s-table-row>
                        ))}
                      </s-table-body>
                    </s-table>
                  ) : (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-stack gap="small">
                        <s-heading>No product pairs yet</s-heading>
                        <s-paragraph>Pairs appear when customers open a comparison with at least two different products.</s-paragraph>
                      </s-stack>
                    </s-box>
                  )}
                </s-stack>
              </s-section>
            </s-grid>
          </>
        )}
      </s-stack>
    </s-page>
  );
}
