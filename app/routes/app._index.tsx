import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { getSetupStatus } from "../setup-status";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { saveStore } from "../billing/billing.server";
import { getAnalyticsSummary } from "../analytics/analytics.server";
import {
  readRowOrder,
  readDisabledRows,
  readMetafields,
  readRowLabels,
} from "../comparison-rows";
import { DashboardComparisonRows } from "../components/dashboard-comparison-rows";
import { FeatureRequestButton } from "../components/feature-request";
import { readReviewSettings } from "../review-settings";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const store = await db.store.findUnique({
    where: { shop: session.shop },
    select: { setupGuideDismissed: true },
  });
  const editor = `https://${session.shop}/admin/themes/current/editor`;
  const response = await admin.graphql(`#graphql
    query DashboardStoreName {
      shop { name }
      currentAppInstallation {
        metafield(namespace: "comparison", key: "row_order") { value }
        disabled: metafield(namespace: "comparison", key: "disabled_rows") { value }
        fields: metafield(namespace: "comparison", key: "product_metafields") { value }
        labels: metafield(namespace: "comparison", key: "row_labels") { value }
        reviews: metafield(namespace: "comparison", key: "review_settings") { value }
      }
    }
  `);
  const result = await response.json();
  const installation = result.data?.currentAppInstallation;
  const fields = readMetafields(installation?.fields?.value);
  const rowSettings =
    installation && !("errors" in result && result.errors)
      ? {
          fields,
          order: readRowOrder(installation.metafield?.value, fields),
          disabled: readDisabledRows(installation.disabled?.value, fields),
          labels: readRowLabels(installation.labels?.value, fields),
          reviewSettings: readReviewSettings(installation.reviews?.value),
        }
      : null;
  const storeName = result.data?.shop?.name?.trim() || session.shop;
  const endDate = new Date();
  const startDate = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate() - 29,
    ),
  );
  const analytics = await getAnalyticsSummary(
    session.shop,
    startDate,
    endDate,
  ).catch(() => null);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY;
  // eslint-disable-next-line no-undef
  const embedHandle = process.env.SHOPIFY_COMPARE_EMBED_HANDLE || "app-embed";
  // eslint-disable-next-line no-undef
  const comparisonHandle =
    process.env.SHOPIFY_COMPARE_BLOCK_HANDLE || "comparison-block";
  const embedLink = new URL(editor);
  embedLink.searchParams.set("context", "apps");
  const comparisonLink = new URL(editor);
  comparisonLink.searchParams.set("template", "product");
  if (apiKey) {
    embedLink.searchParams.set("activateAppId", apiKey + "/" + embedHandle);
    comparisonLink.searchParams.set(
      "addAppBlockId",
      apiKey + "/" + comparisonHandle,
    );
    comparisonLink.searchParams.set("target", "mainSection");
  }
  return {
    analytics,
    rowSettings,
    setupGuideDismissed: store?.setupGuideDismissed ?? false,
    shop: session.shop,
    storeName,
    embedHandle,
    comparisonHandle,
    embedUrl: embedLink.toString(),
    comparisonUrl: comparisonLink.toString(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") !== "dismiss-setup-guide")
    return { success: false, error: "Invalid action." };
  try {
    const store = await db.store.findUnique({
      where: { shop: session.shop },
      select: { id: true },
    });
    if (!store) await saveStore(admin, session.shop);
    await db.store.update({
      where: { shop: session.shop },
      data: { setupGuideDismissed: true },
    });
    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Could not dismiss the setup guide. Please try again.",
    };
  }
}

export default function Dashboard() {
  const {
    shop,
    storeName,
    embedUrl,
    comparisonUrl,
    embedHandle,
    comparisonHandle,
    setupGuideDismissed,
    analytics,
    rowSettings,
  } = useLoaderData<typeof loader>();
  const dismiss = useFetcher<typeof action>();
  const guideHidden =
    setupGuideDismissed ||
    dismiss.state !== "idle" ||
    dismiss.data?.success === true;
  const shopify = useAppBridge();
  const [completed, setCompleted] = useState<[boolean, boolean]>([
    false,
    false,
  ]);
  const [ready, setReady] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [showManualCode, setShowManualCode] = useState(false);
  const [expanded, setExpanded] = useState({
    guide: true,
    step1: true,
    step2: false,
  });
  useEffect(() => {
    if (guideHidden) return;
    let disposed = false;
    let checking = false;
    setReady(false);
    setCompleted([false, false]);
    setStatusError(false);
    async function refreshStatus() {
      if (disposed || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const extensions = await shopify.app.extensions();
        if (disposed) return;
        setCompleted(
          getSetupStatus(extensions, {
            embed: embedHandle,
            comparison: comparisonHandle,
          }),
        );
        setReady(true);
        setStatusError(false);
      } catch {
        if (disposed) return;
        setCompleted([false, false]);
        setReady(false);
        setStatusError(true);
      } finally {
        checking = false;
      }
    }
    void refreshStatus();
    const interval = window.setInterval(() => void refreshStatus(), 10_000);
    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
    };
  }, [shopify, shop, embedHandle, comparisonHandle, guideHidden]);

  useEffect(() => {
    if (!ready) return;

    if (!completed[0]) {
      // Step 1 incomplete
      setExpanded((prev) => ({
        ...prev,
        step1: true,
        step2: false,
      }));
    } else if (!completed[1]) {
      // Step 1 complete, Step 2 incomplete
      setExpanded((prev) => ({
        ...prev,
        step1: false,
        step2: true,
      }));
    } else {
      // Both steps complete
      setExpanded((prev) => ({
        ...prev,
        step1: false,
        step2: false,
      }));
    }
  }, [completed, ready]);

  const count = completed.filter(Boolean).length;
  const steps = [
    {
      title: "Enable app embed",
      description: "Enable product comparison in your theme.",
      instructions: [
        "Open App embeds.",
        "Turn on Product Compare.",
        "Save your theme.",
      ],
      button: "Enable app embed",
      url: embedUrl,
      image: "/images/setup-guide/enable-app-embed.png",
      imageAlt: "Theme editor with the Product Compare app embed enabled",
    },
    {
      title: "Add comparison block",
      description: "Show comparison on your product pages.",
      instructions: [
        "Open the product template.",
        "Add the comparison app block.",
        "Place it and save.",
      ],
      button: "Add comparison block",
      url: comparisonUrl,
      image: "/images/setup-guide/add-comparison-block.png",
      imageAlt: "Theme editor adding a comparison block to a product page",
    },
  ];
  return (
    <s-page heading="Product Compare">
      <FeatureRequestButton />
      <s-stack gap="base">
        <s-stack>
          <s-heading fontSize="large-300">{`Welcome, ${storeName}`}!</s-heading>
          <s-paragraph>
            Help customers find the right product. Complete these two steps to
            set up your theme.
          </s-paragraph>
        </s-stack>

        {dismiss.data?.error && (
          <s-banner tone="critical">{dismiss.data.error}</s-banner>
        )}
        {!guideHidden && (
          <s-section>
            <s-stack gap="small-100">
              <s-grid
                gridTemplateColumns="1fr auto auto"
                gap="small-300"
                alignItems="center"
              >
                <s-heading>Setup guide</s-heading>
                <s-button
                  accessibilityLabel="Dismiss Guide"
                  variant="tertiary"
                  tone="neutral"
                  icon="x"
                  onClick={() => {
                    void dismiss.submit(
                      { intent: "dismiss-setup-guide" },
                      { method: "post" },
                    );
                  }}
                />
                <s-button
                  variant="tertiary"
                  accessibilityLabel={
                    expanded.guide
                      ? "Collapse setup guide"
                      : "Expand setup guide"
                  }
                  icon={expanded.guide ? "chevron-up" : "chevron-down"}
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      guide: !prev.guide,
                    }))
                  }
                />
              </s-grid>
              <s-paragraph>
                Get your storefront ready for product comparison.
              </s-paragraph>
              <s-stack direction="inline" gap="small-100">
                <s-text color="subdued">
                  {statusError
                    ? "Setup status unavailable"
                    : ready
                      ? `${count} of 2 steps completed`
                      : "Checking your published theme…"}
                </s-text>
                {count === 2 && (
                  <s-badge tone="success">Checklist completed</s-badge>
                )}
              </s-stack>
              {expanded.guide && (<>
                <s-box border="base" borderRadius="base" background="base">
                  {steps.map((step, index) => {
                    const stepKey = index === 0 ? "step1" : "step2";
                    const isExpanded = expanded[stepKey];

                    return (
                      <s-box key={step.title}>
                        {index > 0 && <s-divider />}

                        {/* Accordion Header */}
                        <s-grid
                          gridTemplateColumns="1fr auto auto"
                          gap="base"
                          padding="small"
                          alignItems="center"
                        >
                          <s-heading>
                            {index + 1}. {step.title}
                          </s-heading>

                          <s-badge
                            tone={completed[index] ? "success" : "neutral"}
                          >
                            {statusError
                              ? "Unavailable"
                              : !ready
                                ? "Checking…"
                                : completed[index]
                                  ? "Done"
                                  : "Not complete"}
                          </s-badge>

                          <s-button
                            accessibilityLabel={`Toggle ${step.title}`}
                            variant="tertiary"
                            icon={isExpanded ? "chevron-up" : "chevron-down"}
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [stepKey]: !prev[stepKey],
                              }))
                            }
                          />
                        </s-grid>

                        {/* Accordion Content */}
                        <s-box
                          padding="small"
                          paddingBlockStart="none"
                          display={isExpanded ? "auto" : "none"}
                        >
                          <s-box
                            padding="base"
                            background="subdued"
                            borderRadius="base"
                          >
                            <s-grid
                              gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
                              gap="large"
                              alignItems="center"
                            >
                              <s-stack gap="base">
                                <s-paragraph>{step.description}</s-paragraph>

                                <s-ordered-list>
                                  {step.instructions.map((instruction) => (
                                    <s-list-item key={instruction}>
                                      {instruction}
                                    </s-list-item>
                                  ))}
                                </s-ordered-list>

                                <s-stack direction="inline" gap="base">
                                  <s-button
                                    href={step.url}
                                    target="_blank"
                                    variant={
                                      completed[index] ? "secondary" : "primary"
                                    }
                                  >
                                    {step.button}
                                  </s-button>
                                </s-stack>
                              </s-stack>

                              <div style={{ width: "60%", justifySelf: "end" }}>
                                <a
                                  href={step.image}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Open ${step.title} image in a new tab`}
                                >
                                  <s-image
                                    src={step.image}
                                    alt={step.imageAlt}
                                    aspectRatio="4/3"
                                    objectFit="cover"
                                    borderRadius="base"
                                  />
                                </a>
                              </div>
                            </s-grid>
                          </s-box>
                        </s-box>
                      </s-box>
                    );
                  })}
                  </s-box>
                  <s-paragraph>
                    If you want to display the <b>Compare option</b> on collection
                    pages or any other product section, simply add{" "}
                    <button
                      type="button"
                      aria-expanded={showManualCode}
                      onClick={() => setShowManualCode((visible) => !visible)}
                      style={{
                        appearance: "none",
                        background: "none",
                        border: 0,
                        color: "#005bd3",
                        cursor: "pointer",
                        font: "inherit",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      this code snippet
                    </button>{" "}
                     in the product section.
                  </s-paragraph>
                  <s-box
                    background="subdued"
                    padding="base"
                    borderRadius="base"
                    display={showManualCode ? "auto" : "none"}
                  >
                    <pre
                      style={{
                        margin: 0,
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <code>{`{% unless product == blank or product.tags contains 'no-comparison' %}
  <product-comparison-slot
    data-product-id="{{ product.id }}"
  ></product-comparison-slot>
{% endunless %}`}</code>
                    </pre>
                  </s-box>
                  </>
              )}

              {statusError && (
                <s-banner tone="warning">
                  We couldn’t check your theme status. We’ll retry
                  automatically. You can still open the theme editor to complete
                  setup.
                </s-banner>
              )}
            </s-stack>
          </s-section>
        )}
        <s-section heading="Basic analytics">
          <s-stack gap="base">
            <s-text color="subdued">Last 30 days · UTC</s-text>
            {!analytics ? (
              <s-banner tone="warning">
                Analytics are temporarily unavailable. Please refresh to try
                again.
              </s-banner>
            ) : analytics.total === 0 ? (
              <s-paragraph>
                No comparison activity yet. Analytics will appear when customers
                start using product comparison.
              </s-paragraph>
            ) : (
              <>
                <s-grid
                  gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
                  gap="base"
                >
                  {[
                    [
                      "Comparison Opens",
                      analytics.opens.toLocaleString(),
                      "rgb(143 191 255)",
                    ],
                    [
                      "Products Added to Comparison",
                      analytics.added.toLocaleString(),
                      "rgb(196 166 255)",
                    ],
                    [
                      "Add to Cart from Comparison",
                      analytics.cart.toLocaleString(),
                      "rgb(144 255 188)",
                    ],
                    [
                      "Comparison Conversion Rate",
                      `${analytics.conversionRate.toFixed(1)}%`,
                      "rgb(255 213 133)",
                    ],
                  ].map(([label, value, backgroundColor]) => (
                    <div
                      key={label}
                      style={{ backgroundColor, borderRadius: "8px" }}
                    >
                      <s-box borderRadius="base" padding="base">
                        <s-stack gap="small-100">
                          <s-text color="subdued">{label}</s-text>
                          <s-heading>{value}</s-heading>
                        </s-stack>
                      </s-box>
                    </div>
                  ))}
                </s-grid>
                <s-paragraph>
                  Conversion rate = Add to Cart clicks ÷ comparison opens × 100.
                  This measures clicks, not purchases.
                </s-paragraph>
              </>
            )}
            <s-button href="/app/analytics?days=30" variant="secondary">
              View all analytics
            </s-button>
          </s-stack>
        </s-section>
        {rowSettings ? (
          <DashboardComparisonRows
            key={JSON.stringify(rowSettings)}
            initial={rowSettings}
          />
        ) : (
          <s-section heading="Comparison table rows">
            <s-banner tone="warning">
              Table settings are temporarily unavailable. Please refresh to try
              again.
            </s-banner>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}
