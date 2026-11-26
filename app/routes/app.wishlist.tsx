import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
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
  const saving = fetcher.state !== "idle"; const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.settings && applied.current !== fetcher.data) { applied.current = fetcher.data; setDraft(fetcher.data.settings); setBaseline(fetcher.data.settings); shopify.toast.show("Wishlist settings saved"); } }, [fetcher.data, fetcher.state, shopify]);
  const submit = (value: unknown) => void fetcher.submit(JSON.stringify(value), { method: "post", encType: "application/json" });
  const patch = <K extends keyof WishlistSettingsDraft>(key: K, value: WishlistSettingsDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const patchSection = <K extends "general" | "button" | "page" | "text">(key: K, value: Partial<WishlistSettingsDraft[K]>) => setDraft((old) => ({ ...old, [key]: { ...old[key], ...value } }));
  const option = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return <s-page heading="Wishlist"><s-paragraph>Allow customers to save their favorite products and return to purchase them later.</s-paragraph>
    <SaveBar id="wishlist-save-bar" open={dirty || saving}><button variant="primary" disabled={saving} onClick={() => submit(draft)}>Save</button><button disabled={saving} onClick={() => setDraft(baseline)}>Discard</button></SaveBar>
    {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
    <s-section heading="General settings"><s-stack gap="base"><s-switch label="Enable Wishlist functionality" checked={draft.enabled} onChange={(e) => patch("enabled", readToggle(e.currentTarget.checked, draft.enabled))} /><Switches values={draft.general} onChange={(key, value) => patchSection("general", { [key]: value })} /></s-stack></s-section>
    <s-section heading="Wishlist button customization"><s-stack gap="base"><s-grid gridTemplateColumns="repeat(2,minmax(0,1fr))" gap="base">
      <s-select label="Button type" value={draft.button.type} onChange={(e) => patchSection("button", { type: e.currentTarget.value as WishlistSettingsDraft["button"]["type"] })}>{["icon", "text", "icon_text"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
      <s-select label="Icon style" value={draft.button.iconStyle} onChange={(e) => patchSection("button", { iconStyle: e.currentTarget.value as "outline" | "filled" })}><s-option value="outline">Outline heart</s-option><s-option value="filled">Filled heart</s-option></s-select>
      {(["defaultIconColor", "activeIconColor", "backgroundColor", "textColor", "borderColor"] as const).map((key) => <s-color-field key={key} label={option(key)} value={draft.button[key]} onInput={(e) => patchSection("button", { [key]: e.currentTarget.value })} />)}
      {(["borderRadius", "iconSize", "padding"] as const).map((key) => <s-number-field key={key} label={option(key)} value={String(draft.button[key])} min={key === "iconSize" ? 12 : key === "padding" ? 4 : 0} max={key === "iconSize" ? 48 : key === "padding" ? 32 : 40} onChange={(e) => patchSection("button", { [key]: Number(e.currentTarget.value) })} />)}
      <s-select label="Button alignment" value={draft.button.alignment} onChange={(e) => patchSection("button", { alignment: e.currentTarget.value as "left" | "center" | "right" })}>{["left", "center", "right"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
      <s-select label="Position on product cards" value={draft.button.cardPosition} onChange={(e) => patchSection("button", { cardPosition: e.currentTarget.value as WishlistSettingsDraft["button"]["cardPosition"] })}>{["top_left", "top_right", "bottom_left", "bottom_right"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
      <s-select label="Position on product detail pages" value={draft.button.productPosition} onChange={(e) => patchSection("button", { productPosition: e.currentTarget.value as WishlistSettingsDraft["button"]["productPosition"] })}>{["above_buy", "below_buy", "below_title"].map((v) => <s-option key={v} value={v}>{option(v)}</s-option>)}</s-select>
    </s-grid></s-stack></s-section>
    <s-section heading="Wishlist page settings"><s-stack gap="base"><s-text-field label="Wishlist page title" value={draft.page.title} maxLength={120} onInput={(e) => patchSection("page", { title: e.currentTarget.value })} /><s-text-area label="Wishlist page description" value={draft.page.description} maxLength={500} onInput={(e) => patchSection("page", { description: e.currentTarget.value })} /><s-grid gridTemplateColumns="repeat(2,minmax(0,1fr))" gap="base"><s-select label="Layout" value={draft.page.layout} onChange={(e) => patchSection("page", { layout: e.currentTarget.value as "grid" | "list" })}><s-option value="grid">Grid</s-option><s-option value="list">List</s-option></s-select><s-select label="Products per row on desktop" value={String(draft.page.productsPerRow)} onChange={(e) => patchSection("page", { productsPerRow: Number(e.currentTarget.value) as 2 | 3 | 4 | 5 })}>{[2,3,4,5].map((v) => <s-option key={v} value={String(v)}>{v}</s-option>)}</s-select><s-color-field label="Page background color" value={draft.page.backgroundColor} onInput={(e) => patchSection("page", { backgroundColor: e.currentTarget.value })} /><s-color-field label="Page text color" value={draft.page.textColor} onInput={(e) => patchSection("page", { textColor: e.currentTarget.value })} /></s-grid>{(["showImage", "showTitle", "showPrice", "showAvailability", "showAddToCart", "showRemove", "showContinueShopping"] as const).map((key) => <s-switch key={key} label={option(key)} checked={draft.page[key]} onChange={(e) => patchSection("page", { [key]: readToggle(e.currentTarget.checked, draft.page[key]) })} />)}</s-stack></s-section>
    <s-section heading="Text customization"><s-paragraph>These default storefront labels can be localized per store. Additional locale records can be added when the storefront translation layer is implemented in Phase 2.</s-paragraph><s-grid gridTemplateColumns="repeat(2,minmax(0,1fr))" gap="base">{Object.entries(draft.text).map(([key, value]) => <s-text-field key={key} label={option(key)} value={String(value)} maxLength={120} onInput={(e) => patchSection("text", { [key]: e.currentTarget.value })} />)}</s-grid></s-section>
    <s-section><s-stack direction="inline" justifyContent="space-between" alignItems="center"><s-paragraph>Reset only this store's Wishlist configuration to safe defaults.</s-paragraph><s-button tone="critical" commandFor="wishlist-reset-modal" command="--show">Reset to defaults</s-button></s-stack></s-section>
    <s-modal id="wishlist-reset-modal" heading="Reset Wishlist settings?"><s-paragraph>This resets all Wishlist settings for this store. Existing app features and data are not affected.</s-paragraph><s-button slot="secondary-actions" commandFor="wishlist-reset-modal" command="--hide">Cancel</s-button><s-button slot="primary-action" variant="primary" tone="critical" disabled={saving} commandFor="wishlist-reset-modal" command="--hide" onClick={() => submit({ intent: "reset" })}>Reset settings</s-button></s-modal>
  </s-page>;
}
