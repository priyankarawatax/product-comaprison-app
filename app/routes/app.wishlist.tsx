import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import styles from "../styles/wishlist-admin.module.css";
import { authenticate } from "../shopify.server";
import { defaultWishlistSettings, validateWishlistSettings, type WishlistSettingsDraft } from "../wishlist/config";
import { getWishlistSettings, resetWishlistSettings, saveWishlistSettings, updateWishlistSetupGuide } from "../wishlist/wishlist.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try { return { settings: await getWishlistSettings(session.shop) }; }
  catch { throw new Response("Store installation not found. Reopen the app from Shopify admin.", { status: 404 }); }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") return data({ settings: null, error: "Method not allowed." }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 50_000) return data({ settings: null, error: "Settings are too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return data({ settings: null, error: "Invalid request." }, { status: 400 }); }
  const intent = body && typeof body === "object" && "intent" in body ? String((body as { intent: unknown }).intent) : "save";
  try {
    if (intent === "reset") return { settings: await resetWishlistSettings(session.shop), error: null };
    if (intent === "guide") return { settings: await updateWishlistSetupGuide(session.shop, Boolean((body as { dismissed?: unknown }).dismissed)), error: null };
    const checked = validateWishlistSettings(body);
    if (!checked.data) return data({ settings: null, error: checked.error || "Invalid Wishlist settings." }, { status: 400 });
    return { settings: await saveWishlistSettings(session.shop, checked.data), error: null };
  } catch { return data({ settings: null, error: "Could not save Wishlist settings. Your changes are still here; please try again." }, { status: 500 }); }
}

const readToggle = (value: unknown, current: boolean) => typeof value === "boolean" ? value : !current;
const heart = (filled: boolean) => filled ? "♥" : "♡";
function Switches({ values, onChange }: { values: Record<string, boolean>; onChange: (key: string, value: boolean) => void }) {
  const labels: Record<string, string> = { showOnProductCards: "Show Wishlist icon on product cards", showOnProductPages: "Show Wishlist icon on product detail pages", allowGuests: "Allow guest users to use Wishlist", allowCustomers: "Allow logged-in customers to save Wishlist items", mergeAfterLogin: "Merge guest Wishlist with customer Wishlist after login" };
  return <s-stack gap="base">{Object.entries(values).map(([key, value]) => <s-switch key={key} label={labels[key]} checked={value} onChange={(event) => onChange(key, readToggle(event.currentTarget.checked, value))} />)}</s-stack>;
}

export default function Wishlist() {
  const initial = useLoaderData<typeof loader>(); const fetcher = useFetcher<typeof action>(); const shopify = useAppBridge();
  const [draft, setDraft] = useState(initial.settings); const [baseline, setBaseline] = useState(initial.settings); const applied = useRef<unknown>(null);
  type SettingsTab = "general" | "button" | "page";
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General settings" },
    { id: "button", label: "Wishlist button" },
    { id: "page", label: "Wishlist page" },
  ];
  const tabDetails: Record<SettingsTab, { eyebrow: string; description: string; icon: string }> = {
    general: { eyebrow: "Wishlist setup", description: "Choose where Wishlist appears and who can save products.", icon: "⚙" },
    button: { eyebrow: "Storefront appearance", description: "Set the Wishlist button style and where it appears on product cards.", icon: "♡" },
    page: { eyebrow: "Storefront appearance", description: "Choose which product details and actions customers see on the Wishlist page.", icon: "▤" },
  };
  const pageToggleLabels = { showImage: "Show image", showTitle: "Show title", showPrice: "Show price", showAvailability: "Show availability", showAddToCart: "Show Add to Cart", showRemove: "Show remove button", showContinueShopping: "Show Continue Shopping" } as const;
  const saving = fetcher.state !== "idle"; const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.settings && applied.current !== fetcher.data) { applied.current = fetcher.data; setDraft(fetcher.data.settings); setBaseline(fetcher.data.settings); shopify.toast.show("Wishlist settings saved"); } }, [fetcher.data, fetcher.state, shopify]);
  const submit = (value: unknown) => void fetcher.submit(JSON.stringify(value), { method: "post", encType: "application/json" });
  const patch = <K extends keyof WishlistSettingsDraft>(key: K, value: WishlistSettingsDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const patchSection = <K extends "general" | "button" | "page" | "text">(key: K, value: Partial<WishlistSettingsDraft[K]>) => setDraft((old) => ({ ...old, [key]: { ...old[key], ...value } }));
  const option = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return <s-page heading="Wishlist" inlineSize="large"><s-section heading=""><s-heading fontSize="large-300">Wishlist settings</s-heading><s-paragraph>Allow customers to save their favorite products and return to purchase them later.</s-paragraph></s-section>
    <SaveBar id="wishlist-save-bar" open={dirty || saving}><button variant="primary" disabled={saving} onClick={() => submit(draft)}>Save</button><button disabled={saving} onClick={() => setDraft(baseline)}>Discard</button></SaveBar>
    {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
    <div className={styles.settingsLayout}>
      <nav className={styles.sidebar} aria-label="Wishlist settings sections"><p className={styles.sidebarLabel}>Wishlist settings</p><div className={styles.menu} role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-current={activeTab === tab.id ? "page" : undefined} aria-controls="wishlist-settings-panel" className={styles.menuButton} onClick={() => setActiveTab(tab.id)}><span className={styles.menuIcon} aria-hidden="true">{tabDetails[tab.id].icon}</span><span className={styles.menuLabel}>{tab.label}</span><span className={styles.menuChevron} aria-hidden="true">›</span></button>)}</div></nav>
      <main id="wishlist-settings-panel" className={styles.panel} role="tabpanel" aria-label={tabs.find((tab) => tab.id === activeTab)?.label}>
        <header className={styles.panelHeader}><p className={styles.panelEyebrow}>{tabDetails[activeTab].eyebrow}</p><h2 className={styles.panelTitle}>{tabs.find((tab) => tab.id === activeTab)?.label}</h2><p className={styles.panelDescription}>{tabDetails[activeTab].description}</p></header>
        <div className={styles.panelBody}>
      {activeTab === "general" && <s-section heading=""><s-stack gap="base"><s-switch label="Enable Wishlist functionality" checked={draft.enabled} onChange={(e) => patch("enabled", readToggle(e.currentTarget.checked, draft.enabled))} /><Switches values={draft.general} onChange={(key, value) => patchSection("general", { [key]: value })} /></s-stack></s-section>}
      {activeTab === "button" && <s-section heading=""><s-stack gap="base"><s-grid gridTemplateColumns="repeat(2,minmax(0,1fr))" gap="base">
      <s-select label="Button type" value={draft.button.type} onChange={(e) => patchSection("button", { type: e.currentTarget.value as WishlistSettingsDraft["button"]["type"] })}>{["icon", "text", "icon_text"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
      <s-number-field label="Border radius" value={String(draft.button.borderRadius)} min={0} max={40} onChange={(e) => patchSection("button", { borderRadius: Number(e.currentTarget.value) })} />
      <s-number-field label="Icon size" value={String(draft.button.iconSize)} min={12} max={48} onChange={(e) => patchSection("button", { iconSize: Number(e.currentTarget.value) })} />
      <s-number-field label="Padding" value={String(draft.button.padding)} min={4} max={32} onChange={(e) => patchSection("button", { padding: Number(e.currentTarget.value) })} />
      <s-select label="Position on product cards" value={draft.button.cardPosition} onChange={(e) => patchSection("button", { cardPosition: e.currentTarget.value as WishlistSettingsDraft["button"]["cardPosition"] })}>{["top_left", "top_right", "bottom_left", "bottom_right"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
      </s-grid></s-stack></s-section>}
      {activeTab === "page" && <s-section heading=""><s-grid gridTemplateColumns="repeat(2,minmax(0,1fr))" gap="large" alignItems="start">
        <s-stack gap="base"><s-text-field label="Wishlist page title" value={draft.page.title} maxLength={120} onInput={(e) => patchSection("page", { title: e.currentTarget.value })} /><s-select label="Products per row on desktop" value={String(draft.page.productsPerRow)} onChange={(e) => patchSection("page", { productsPerRow: Number(e.currentTarget.value) as 2 | 3 | 4 | 5 })}>{[2,3,4,5].map((v) => <s-option key={v} value={String(v)}>{v}</s-option>)}</s-select><s-color-field label="Page text color" value={draft.page.textColor} onInput={(e) => patchSection("page", { textColor: e.currentTarget.value })} /></s-stack>
        <s-stack gap="base"><s-heading>Show on Wishlist page</s-heading>{(Object.keys(pageToggleLabels) as Array<keyof typeof pageToggleLabels>).map((key) => <s-switch key={key} label={pageToggleLabels[key]} checked={draft.page[key]} onChange={(e) => patchSection("page", { [key]: readToggle(e.currentTarget.checked, draft.page[key]) } as Partial<WishlistSettingsDraft["page"]>)} />)}</s-stack>
      </s-grid></s-section>}
        </div>
      </main>
    </div>
  </s-page>;
}
