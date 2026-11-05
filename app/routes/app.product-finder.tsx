import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { saveStore } from "../billing/billing.server";
import { getFinder, saveFinder, FinderConflict } from "../product-finder/finder.server";
import { validateFinder, type FinderDraft, type FinderQuestion, type FinderRuleSet } from "../product-finder/config";
import { ComparisonRowList } from "../components/comparison-row-list";
import { FinderQuestionEditor, newAnswer } from "../components/finder-question-editor";
import { ProductFinderTemplateCards, ProductFinderTemplateModal } from "../components/product-finder-template-modal";
import { createRuleFromTemplate, isProductFinderTemplateId, type FinderTemplateCatalog, type ProductFinderTemplateId } from "../product-finder/templates";
import { getFinderTemplateCatalog } from "../product-finder/template-catalog.server";
import { FeatureRequestButton } from "../components/feature-request";
import { UpgradeState } from "../components/upgrade-state";
import { getStorePlanAccess } from "../billing/entitlements.server";

const advancedFinderFields = [
  "modalBackground", "modalTextColor", "modalAccentColor", "modalBorderRadius",
  "modalTitleSize", "modalQuestionSize", "buttonBackground", "buttonTextColor",
  "buttonBorderColor", "buttonFontSize", "modalPadding", "answerPadding",
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const store = await db.store.findUnique({ where: { shop: session.shop }, select: { shop: true, productFinder: { select: { ruleSets: { select: { id: true }, take: 1 } } } } });
  if (!store) throw new Response("Store installation not found. Reopen the app from Shopify admin.", { status: 404 });
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template");
  let templateCatalog: FinderTemplateCatalog | null = null;
  let templateCatalogError: string | null = null;
  if (/\/product-finder\/create-rule\/?$/.test(url.pathname) && isProductFinderTemplateId(templateId) && templateId !== "custom-product-finder") {
    try { templateCatalog = await getFinderTemplateCatalog(admin, session.shop); }
    catch (error) { templateCatalogError = error instanceof Error ? error.message : "Shopify catalog data could not be loaded."; }
  }
  const finder = await getFinder(store.shop);
  const hasSavedRules = Boolean(store.productFinder?.ruleSets.length);
  const access = await getStorePlanAccess(session.shop);
  return { finder: hasSavedRules ? finder : { ...finder, ruleSets: [] }, templateCatalog, templateCatalogError, access };
}
export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  if (request.method !== "POST") return data({ finder: null, error: "Method not allowed.", field: null }, { status: 405 });
  const text = await request.text();
  if (text.length > 300_000) return data({ finder: null, error: "Settings are too large.", field: null }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(text); } catch { return data({ finder: null, error: "Invalid settings.", field: null }, { status: 400 }); }
  const validated = validateFinder(input);
  if (!validated.data) return data({ finder: null, error: validated.error, field: validated.field }, { status: 400 });
  try {
    const access = await getStorePlanAccess(session.shop);
    const savedFinder = await db.productFinder.findUnique({
      where: { shop: session.shop },
      include: { ruleSets: { include: { questions: { select: { key: true } } } } },
    });
    const savedDraft = await getFinder(session.shop);
    const savedRuleIds = new Set(savedFinder?.ruleSets.map((rule) => rule.key) || []);
    const newRules = validated.data.ruleSets.filter((rule) => !savedRuleIds.has(rule.id));
    const finderLimit = access.entitlements.productFinderLimit;
    if (finderLimit !== null && newRules.length > Math.max(0, finderLimit - savedRuleIds.size)) {
      return data({ finder: null, error: "Upgrade to Growth to create unlimited Product Finders.", field: "ruleSets" }, { status: 403 });
    }
    const questionLimit = access.entitlements.finderQuestionLimit;
    if (questionLimit !== null) {
      for (const [ruleIndex, rule] of validated.data.ruleSets.entries()) {
        const existingQuestions = new Set(savedFinder?.ruleSets.find((saved) => saved.key === rule.id)?.questions.map((question) => question.key) || []);
        const newQuestionCount = rule.questions.filter((question) => !existingQuestions.has(question.id)).length;
        if (newQuestionCount > Math.max(0, questionLimit - existingQuestions.size)) {
          return data({ finder: null, error: `Your Free plan supports up to ${questionLimit} Product Finder questions.`, field: `ruleSets.${ruleIndex}.questions` }, { status: 403 });
        }
      }
    }
    if (!access.entitlements.advancedCustomization && advancedFinderFields.some((field) => validated.data![field] !== savedDraft[field])) {
      return data({ finder: null, error: "Advanced Product Finder customization is available on the Growth plan.", field: null }, { status: 403 });
    }
    const collectionIds = validated.data.ruleSets.flatMap((rule) => rule.sourceType === "collection" ? rule.collections.map((item) => item.id) : []);
    const productIds = validated.data.ruleSets.flatMap((rule) => rule.sourceType === "product" ? rule.products.map((item) => item.id) : []);
    if (collectionIds.length) {
      const response = await admin.graphql(`#graphql
        query FinderCollections($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Collection { id title image { url } productsCount { count } } }
        }
      `, { variables: { ids: collectionIds } });
      const result = await response.json();
      if (("errors" in result && result.errors) || !Array.isArray(result.data?.nodes)) return data({ finder: null, error: "Selected collections could not be verified.", field: "ruleSets" }, { status: 400 });
      const collections = new Map(result.data.nodes.filter(Boolean).map((item: { id: string; title: string; image?: { url?: string } | null; productsCount?: { count?: number } }) => [item.id, { id: item.id, title: item.title, imageUrl: item.image?.url || null, productCount: item.productsCount?.count ?? 0 }]));
      for (const [index, rule] of validated.data.ruleSets.entries()) if (rule.sourceType === "collection") {
        const verified = rule.collections.map((item) => collections.get(item.id)).filter(Boolean) as typeof rule.collections;
        if (verified.length !== rule.collections.length) return data({ finder: null, error: "A selected collection is unavailable. Choose collections from this store.", field: "ruleSets." + index + ".collections" }, { status: 400 });
        rule.collections = verified; rule.collectionId = verified[0]?.id || null; rule.collectionTitle = verified[0]?.title || null;
      }
    }
    if (productIds.length) {
      const response = await admin.graphql(`#graphql
        query FinderProducts($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { id title featuredImage { url } } } }
        }
      `, { variables: { ids: productIds } });
      const result = await response.json();
      if (("errors" in result && result.errors) || !Array.isArray(result.data?.nodes)) return data({ finder: null, error: "Selected products could not be verified.", field: "ruleSets" }, { status: 400 });
      const products = new Map(result.data.nodes.filter(Boolean).map((item: { id: string; title: string; featuredImage?: { url?: string } | null }) => [item.id, { id: item.id, title: item.title, imageUrl: item.featuredImage?.url || null }]));
      for (const [index, rule] of validated.data.ruleSets.entries()) if (rule.sourceType === "product") {
        const verified = rule.products.map((item) => products.get(item.id)).filter(Boolean) as typeof rule.products;
        if (verified.length !== rule.products.length) return data({ finder: null, error: "A selected product is unavailable. Choose products from this store.", field: "ruleSets." + index + ".products" }, { status: 400 });
        rule.products = verified; rule.productId = verified[0]?.id || null; rule.productTitle = verified[0]?.title || null;
      }
    }
    const store = await db.store.findUnique({ where: { shop: session.shop }, select: { shop: true } }) || await saveStore(admin, session.shop);
    return { finder: await saveFinder(store.shop, validated.data), error: null, field: null };
  } catch (error) {
    if (error instanceof FinderConflict) return data({ finder: null, error: error.message, field: null }, { status: 409 });
    return data({ finder: null, error: "Could not save Product Finder. Your changes are still here; please try again.", field: null }, { status: 500 });
  }
}

function FinderLivePreview({ draft, rule }: { draft: FinderDraft; rule: FinderRuleSet }) {
  const active = rule.questions.filter((question) => question.enabled);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [rule.id, active.length]);
  const question = active[Math.min(index, Math.max(0, active.length - 1))];
  return <s-section>
    <s-stack gap="base">
      <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
        <s-stack direction="inline" gap="small" alignItems="center"><s-heading>Live storefront preview</s-heading><s-badge tone="success" icon="enabled"></s-badge></s-stack>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button icon="edit" variant="tertiary" accessibilityLabel="Customize storefront button" commandFor="finder-button-settings-modal"></s-button>
          <button type="button" style={{ minHeight: 38, padding: "0 18px", border: "1px solid " + draft.buttonBorderColor, borderRadius: 999, background: draft.buttonBackground, color: draft.buttonTextColor, fontSize: draft.buttonFontSize, fontWeight: 650 }}>{(draft.buttonText || "Find the right product").slice(0, 22)}</button>
        </s-stack>
      </s-stack>
      <div style={{ border: "1px solid #e5e1dc", borderRadius: draft.modalBorderRadius, padding: draft.modalPadding, background: draft.modalBackground, color: draft.modalTextColor, boxShadow: "0 14px 36px rgba(32, 32, 32, 0.08)" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, color: draft.modalTextColor, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: draft.modalTitleSize, fontWeight: 500, lineHeight: 1.1 }}>{draft.title || "Find the right product"}</h2>
            <s-button icon="edit" variant="tertiary" accessibilityLabel="Customize modal" commandFor="finder-general-settings-modal"></s-button>
          </div>
          {draft.description && <p style={{ margin: 0, color: draft.modalTextColor, opacity: 0.7 }}>{draft.description}</p>}
          {question ? <>
            <div style={{ color: draft.modalTextColor, opacity: 0.65, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{"Question " + (index + 1) + " of " + active.length}</div>
            <div style={{ height: 4, borderRadius: 999, background: "#E8E3DE", overflow: "hidden" }}><div style={{ width: ((index + 1) / active.length * 100) + "%", height: "100%", borderRadius: 999, background: draft.modalAccentColor }} /></div>
            <h3 style={{ margin: 0, color: draft.modalTextColor, fontSize: draft.modalQuestionSize, lineHeight: 1.3 }}>{question.question || "Question text"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {question.answers.map((answer) => <label key={answer.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: Math.min(draft.answerPadding, 8), border: "1px solid " + draft.modalAccentColor, borderRadius: 12, background: "#FFFFFF", color: draft.modalTextColor }}><input type="radio" name={"preview-answer-" + question.id} /><span>{answer.label || "Answer option"}</span></label>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><s-button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Back</s-button><s-button variant="primary" disabled={index >= active.length - 1} onClick={() => setIndex((value) => Math.min(active.length - 1, value + 1))}>{index === active.length - 1 ? "Find my matches" : "Next"}</s-button></div>
          </> : <p style={{ margin: 0 }}>Add an active question to preview this rule.</p>}
          <span style={{ color: draft.modalTextColor, opacity: 0.65, fontSize: 13 }}>Up to {draft.recommendationLimit || 10} products will appear here.</span>
        </div>
      </div>
    </s-stack>
  </s-section>;
}

export default function ProductFinder({ createMode = false, ruleId }: { createMode?: boolean; ruleId?: string }) {
  const { finder, templateCatalog, templateCatalogError, access } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const pathCreateMode = /\/product-finder\/create-rule\/?$/.test(location.pathname);
  const pathEditMatch = location.pathname.match(/\/product-finder\/edit-rule\/([^/]+)\/?$/);
  const effectiveCreateMode = createMode || pathCreateMode;
  const selectedTemplateId = new URLSearchParams(location.search).get("template");
  const effectiveRuleId = ruleId || (pathEditMatch ? decodeURIComponent(pathEditMatch[1]) : undefined);
  const editorMode = effectiveCreateMode || Boolean(effectiveRuleId);
  const [initialDraft] = useState<FinderDraft>(() => {
    if (!effectiveCreateMode) return finder;
    const rule = createRuleFromTemplate(selectedTemplateId, templateCatalog);
    return { ...finder, enabled: true, ruleSets: [...finder.ruleSets, rule] };
  });
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [draft, setDraft] = useState<FinderDraft>(initialDraft);
  const [baseline, setBaseline] = useState<FinderDraft>(() => effectiveCreateMode ? finder : initialDraft);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const initialRuleId = effectiveCreateMode ? initialDraft.ruleSets.at(-1)?.id || "" : effectiveRuleId && finder.ruleSets.some((rule) => rule.id === effectiveRuleId) ? effectiveRuleId : finder.ruleSets[0]?.id || "";
  const [selectedRuleId, setSelectedRuleId] = useState(initialRuleId);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(editorMode ? initialRuleId || null : null);
  const [picking, setPicking] = useState(false);
  const [vendorInput, setVendorInput] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectingTemplateId, setSelectingTemplateId] = useState<ProductFinderTemplateId | null>(null);
  const [lastSuccess, setLastSuccess] = useState<"save" | "delete" | null>(null);
  const pendingSuccess = useRef<"save" | "delete">("save");
  const applied = useRef<unknown>(null);
  const saving = fetcher.state !== "idle"; const busy = saving || picking || selectingTemplateId !== null;
  const canCreateFinder = access.entitlements.productFinderLimit === null || draft.ruleSets.length < access.entitlements.productFinderLimit;
  useEffect(() => {
    if (!editorMode) {
      setEditingRuleId(null);
      return;
    }
    if (effectiveCreateMode && !editingRuleId) {
      const rule = createRuleFromTemplate(selectedTemplateId, templateCatalog);
      const nextDraft = { ...draft, enabled: true, ruleSets: [...draft.ruleSets, rule] };
      setDraft(nextDraft);
      setBaseline(finder);
      setSelectedRuleId(rule.id);
      setEditingRuleId(rule.id);
      return;
    }
    if (effectiveRuleId && effectiveRuleId !== editingRuleId && draft.ruleSets.some((rule) => rule.id === effectiveRuleId)) {
      setSelectedRuleId(effectiveRuleId);
      setEditingRuleId(effectiveRuleId);
    }
  }, [draft, editingRuleId, editorMode, effectiveCreateMode, effectiveRuleId, selectedTemplateId, templateCatalog, finder]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const selectedRuleIndex = Math.max(0, draft.ruleSets.findIndex((rule) => rule.id === selectedRuleId));
  const selectedRule = draft.ruleSets[selectedRuleIndex] || draft.ruleSets[0];
  const shownError = error || fetcher.data?.error || "";
  const shownField = errorField || fetcher.data?.field || null;
  const fieldError = (field: string) => shownField === field ? shownError : undefined;
  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.finder && applied.current !== fetcher.data) { applied.current = fetcher.data; const success = pendingSuccess.current; setDraft(fetcher.data.finder); setBaseline(fetcher.data.finder); setSelectedRuleId(fetcher.data.finder.ruleSets[0]?.id || ""); setEditingRuleId(null); setError(""); setErrorField(null); setLastSuccess(success); if (success === "delete") shopify.toast.show("Rule deleted"); pendingSuccess.current = "save"; if (editorMode) navigate("/app/product-finder"); } }, [editorMode, fetcher.data, fetcher.state, navigate, shopify]);
  const update = (change: Partial<FinderDraft>) => { setLastSuccess(null); setDraft((previous) => ({ ...previous, ...change })); };
  const updateRule = (change: Partial<FinderRuleSet>) => update({ ruleSets: draft.ruleSets.map((rule) => rule.id === selectedRule.id ? { ...rule, ...change } : rule) });
  const updateQuestion = (question: FinderQuestion) => updateRule({ questions: selectedRule.questions.map((entry) => entry.id === question.id ? question : entry) });
  const save = () => { const result = validateFinder(draft); if (!result.data) { setError(result.error); setErrorField(result.field); const match = result.field?.match(/^ruleSets\.(\d+)/); if (match) { const invalidRuleId = draft.ruleSets[Number(match[1])]?.id || selectedRuleId; setSelectedRuleId(invalidRuleId); setEditingRuleId(invalidRuleId); const questionMatch = result.field?.match(/^ruleSets\.\d+\.questions\.(\d+)/); if (questionMatch) setEditingQuestionId(draft.ruleSets[Number(match[1])]?.questions[Number(questionMatch[1])]?.id || null); } return; } setError(""); setErrorField(null); pendingSuccess.current = "save"; void fetcher.submit(JSON.stringify(result.data), { method: "post", encType: "application/json" }); };
  const chooseCollection = async () => { setPicking(true); setError(""); setErrorField(null); try { const selected = await shopify.resourcePicker({ type: "collection", multiple: true, action: "add", selectionIds: selectedRule.collections.map((item) => ({ id: item.id })) }); if (selected) { const collections = selected.map((item) => ({ id: item.id, title: item.title, imageUrl: (item as { image?: { originalSrc?: string; url?: string } }).image?.originalSrc || (item as { image?: { url?: string } }).image?.url || null, productCount: (item as { productsCount?: number }).productsCount ?? null })); updateRule({ collections, collectionId: collections[0]?.id || null, collectionTitle: collections[0]?.title || null }); } } catch { setError("Could not open the collection picker. Please try again."); } finally { setPicking(false); } };
  const chooseProduct = async () => { setPicking(true); setError(""); setErrorField(null); try { const selected = await shopify.resourcePicker({ type: "product", multiple: true, action: "add", selectionIds: selectedRule.products.map((item) => ({ id: item.id })) }); if (selected) { const products = selected.map((item) => ({ id: item.id, title: item.title, imageUrl: item.images?.[0]?.originalSrc || null })); updateRule({ products, productId: products[0]?.id || null, productTitle: products[0]?.title || null }); } } catch { setError("Could not open the product picker. Please try again."); } finally { setPicking(false); } };
  const addQuestion = () => { if (access.entitlements.finderQuestionLimit !== null && selectedRule.questions.length >= access.entitlements.finderQuestionLimit) { setError(`Your Free plan supports up to ${access.entitlements.finderQuestionLimit} Product Finder questions.`); setErrorField(basePath + ".questions"); return; } const question = { id: crypto.randomUUID(), question: "", enabled: true, answers: [newAnswer(), newAnswer()] }; updateRule({ questions: [...selectedRule.questions, question] }); setEditingQuestionId(question.id); };
  const duplicateSelectedRule = () => { const copy: FinderRuleSet = { ...selectedRule, id: crypto.randomUUID(), name: (selectedRule.name || "Untitled rule") + " copy", questions: selectedRule.questions.map((question) => ({ ...question, id: crypto.randomUUID(), answers: question.answers.map((answer) => ({ ...answer, id: crypto.randomUUID() })) })) }; update({ ruleSets: [...draft.ruleSets, copy] }); setSelectedRuleId(copy.id); setEditingRuleId(copy.id); setEditingQuestionId(null); navigate("/app/product-finder/edit-rule/" + encodeURIComponent(copy.id)); };
  const selectTemplate = (templateId: ProductFinderTemplateId) => {
    if (selectingTemplateId) return;
    if (!canCreateFinder) { setError("Upgrade to Growth to create unlimited Product Finders."); setErrorField("ruleSets"); return; }
    setSelectingTemplateId(templateId);
    navigate("/app/product-finder/create-rule?template=" + encodeURIComponent(templateId));
  };
  const editRule = (selectedId: string) => navigate("/app/product-finder/edit-rule/" + encodeURIComponent(selectedId));
  const setRuleEnabled = (ruleId: string, enabled: boolean) => update({ ruleSets: draft.ruleSets.map((rule) => rule.id === ruleId ? { ...rule, enabled } : rule) });
  const confirmDeleteRule = () => { if (!deleteTarget || saving) return; const next = { ...draft, ruleSets: draft.ruleSets.filter((rule) => rule.id !== deleteTarget.id) }; const result = validateFinder(next); if (!result.data) { setError(result.error); setErrorField(result.field); return; } pendingSuccess.current = "delete"; setLastSuccess(null); setDraft(next); setEditingQuestionId(null); setError(""); setErrorField(null); setDeleteTarget(null); void fetcher.submit(JSON.stringify(result.data), { method: "post", encType: "application/json" }); };
  const deleteConfirmation = <s-modal id="finder-delete-rule-modal" heading="Delete rule?"><s-paragraph>Are you sure you want to delete {deleteTarget?.name || "this rule"}? This action cannot be undone.</s-paragraph><s-button slot="primary-action" variant="primary" tone="critical" disabled={saving || !deleteTarget} commandFor="finder-delete-rule-modal" command="--hide" onClick={confirmDeleteRule}>Delete rule</s-button><s-button slot="secondary-actions" commandFor="finder-delete-rule-modal" command="--hide" onClick={() => setDeleteTarget(null)}>Cancel</s-button></s-modal>;
  const basePath = "ruleSets." + selectedRuleIndex;
  if (!editingRuleId) return <s-page heading="Product Finder" inlineSize="large">
    <FeatureRequestButton />
    {draft.ruleSets.length > 0 && <s-button slot="primary-action" variant="primary" disabled={busy || draft.ruleSets.length >= 10 || !canCreateFinder} commandFor="product-finder-template-modal" command="--show">Create rule</s-button>}
    <ProductFinderTemplateModal busy={busy || !canCreateFinder} selectingTemplateId={selectingTemplateId} onSelect={selectTemplate} />
    {deleteConfirmation}
    <SaveBar id="product-finder-save-bar" open={dirty || saving}><button variant="primary" disabled={busy} onClick={save}>Save</button><button disabled={busy} onClick={() => { if (editorMode) { navigate("/app/product-finder"); return; } setDraft(baseline); setSelectedRuleId(baseline.ruleSets[0]?.id || ""); setError(""); setErrorField(null); }}>Discard</button></SaveBar>
    <s-stack gap="base">
      {shownError && <s-banner tone="critical">{shownError}</s-banner>}
      {!canCreateFinder && <s-banner tone="info">Upgrade to Growth to create unlimited Product Finders. <s-link href="/app/billing">View plans</s-link></s-banner>}
      {lastSuccess === "save" && !dirty && !saving && <s-banner tone="success">Product Finder saved.</s-banner>}
      {draft.ruleSets.length === 0 ? <s-section heading="Choose a Product Finder Template">
        <s-stack gap="base">
          <s-paragraph>Start with a ready-made template or create your own.</s-paragraph>
          <ProductFinderTemplateCards busy={busy || !canCreateFinder} selectingTemplateId={selectingTemplateId} onSelect={selectTemplate} />
        </s-stack>
      </s-section> : <s-section heading="Finder rules">
        <s-stack gap="base">
          <s-paragraph>Manage the questions shown for each collection and for all other products.</s-paragraph>
          <s-table variant="auto">
            <s-table-header-row><s-table-header listSlot="primary">Rule</s-table-header><s-table-header listSlot="labeled">Applies to</s-table-header><s-table-header listSlot="labeled">Questions</s-table-header><s-table-header listSlot="labeled">Status</s-table-header><s-table-header>Action</s-table-header></s-table-header-row>
            <s-table-body>{draft.ruleSets.map((rule) => { const activeQuestions = rule.questions.filter((question) => question.enabled).length; const ready = activeQuestions > 0 && rule.questions.filter((question) => question.enabled).every((question) => question.question.trim() && question.answers.filter((answer) => answer.label.trim()).length >= 2); const menuId = "finder-rule-actions-" + rule.id; const canDelete = true; return <s-table-row key={rule.id}><s-table-cell>{rule.name || "Untitled rule"}</s-table-cell><s-table-cell>{rule.sourceType === "collection" ? rule.collections.length + " collection" + (rule.collections.length === 1 ? "" : "s") : rule.sourceType === "vendor" ? rule.vendors.length + " vendor" + (rule.vendors.length === 1 ? "" : "s") : rule.sourceType === "product" ? rule.products.length + " product" + (rule.products.length === 1 ? "" : "s") : "All other products"}</s-table-cell><s-table-cell>{activeQuestions + " active / " + rule.questions.length + " total"}</s-table-cell><s-table-cell><s-badge tone={!rule.enabled ? "neutral" : ready ? "success" : "warning"}>{!rule.enabled ? "Inactive" : ready ? "Active" : "Needs setup"}</s-badge></s-table-cell><s-table-cell><s-stack direction="inline" gap="small" alignItems="center"><s-button onClick={() => editRule(rule.id)}>Edit</s-button><s-button icon="menu-vertical" accessibilityLabel={"Actions for " + (rule.name || "rule")} commandFor={menuId}></s-button><s-menu id={menuId} accessibilityLabel={"Actions for " + (rule.name || "rule")}><s-button onClick={() => setRuleEnabled(rule.id, !rule.enabled)}>{rule.enabled ? "Deactivate" : "Activate"}</s-button><s-button tone="critical" disabled={!canDelete} commandFor="finder-delete-rule-modal" command="--show" onClick={() => setDeleteTarget({ id: rule.id, name: rule.name || "Untitled rule" })}>Delete</s-button></s-menu></s-stack></s-table-cell></s-table-row>; })}</s-table-body>
          </s-table>
        </s-stack>
      </s-section>}
    </s-stack>
  </s-page>;
  if (!selectedRule) return null;
  return <s-page heading={effectiveCreateMode ? "Create rule" : selectedRule.name || "Edit rule"} inlineSize="large">
    <FeatureRequestButton />
    {editorMode && <s-link slot="breadcrumb-actions" href="/app/product-finder">Product Finder</s-link>}
    {!effectiveCreateMode && <>
      <s-button slot="secondary-actions" icon="duplicate" disabled={busy || draft.ruleSets.length >= 10 || !canCreateFinder} onClick={duplicateSelectedRule}>Duplicate rule</s-button>
      <s-button slot="secondary-actions" commandFor="finder-edit-actions-menu">More actions</s-button>
      <s-menu id="finder-edit-actions-menu" accessibilityLabel="Rule actions"><s-button onClick={() => updateRule({ enabled: !selectedRule.enabled })}>{selectedRule.enabled ? "Deactivate" : "Activate"}</s-button><s-button tone="critical" commandFor="finder-delete-rule-modal" command="--show" onClick={() => setDeleteTarget({ id: selectedRule.id, name: selectedRule.name || "Untitled rule" })}>Delete</s-button></s-menu>
    </>}
    {deleteConfirmation}
    <SaveBar id="product-finder-save-bar" open={dirty || saving}><button variant="primary" disabled={busy} onClick={save}>Save</button><button disabled={busy} onClick={() => { if (editorMode) { navigate("/app/product-finder"); return; } setDraft(baseline); setSelectedRuleId(baseline.ruleSets[0]?.id || ""); setError(""); setErrorField(null); }}>Discard</button></SaveBar>
    <s-stack gap="base">
      {shownError && <s-banner tone="critical">{shownError}</s-banner>}
      {!access.entitlements.advancedCustomization && <UpgradeState heading="Advanced customization" message="Advanced Product Finder customization and custom button/modal styling are available on the Growth plan." requiredPlan="growth" />}
      {fetcher.data?.finder && !dirty && !saving && <s-banner tone="success">Product Finder saved.</s-banner>}
      <s-grid gridTemplateColumns="minmax(0, 1fr) minmax(0, 1fr)" gap="base" alignItems="start">
        <s-stack gap="base">
          <s-section heading="Rule settings"><s-stack gap="base">
            {shownField === "ruleSets" && <s-banner tone="critical">{shownError}</s-banner>}
            <s-text-field label="Rule name" value={selectedRule.name} error={fieldError(basePath + ".name")} disabled={busy} onInput={(event) => updateRule({ name: event.currentTarget.value })} />
            <s-select label="Applies to" value={selectedRule.sourceType} error={fieldError(basePath + ".sourceType")} disabled={busy} onChange={(event) => updateRule({ sourceType: event.currentTarget.value as FinderRuleSet["sourceType"], collectionId: null, collectionTitle: null, vendor: null, productId: null, productTitle: null, collections: [], vendors: [], products: [] })}><s-option value="all_products">All products</s-option><s-option value="collection">Specific collection</s-option><s-option value="vendor">Selected vendor</s-option><s-option value="product">Specific product</s-option></s-select>
            {selectedRule.sourceType === "collection" && <s-stack gap="small"><s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end"><s-text-field label="Search collections" value="" readOnly error={fieldError(basePath + ".collections")} /><s-button disabled={busy} onClick={() => void chooseCollection()}>Browse</s-button></s-grid>{selectedRule.collections.map((collection) => <s-box key={collection.id} border="base" borderRadius="base" padding="base"><s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">{collection.imageUrl ? <s-thumbnail src={collection.imageUrl} alt={collection.title} size="small" /> : <s-box inlineSize="40px"><s-icon type="collection" /></s-box>}<s-stack gap="small"><s-text type="strong">{collection.title}</s-text><s-text color="subdued">{collection.productCount === null ? "Product count available after save" : collection.productCount + " products"}</s-text></s-stack><s-button variant="tertiary" disabled={busy} onClick={() => { const collections = selectedRule.collections.filter((item) => item.id !== collection.id); updateRule({ collections, collectionId: collections[0]?.id || null, collectionTitle: collections[0]?.title || null }); }}>Remove</s-button></s-grid></s-box>)}</s-stack>}
            {selectedRule.sourceType === "vendor" && <s-stack gap="small"><s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end"><s-text-field label="Vendor name" value={vendorInput} error={fieldError(basePath + ".vendors")} disabled={busy} onInput={(event) => setVendorInput(event.currentTarget.value)} /><s-button disabled={busy || !vendorInput.trim()} onClick={() => { const value = vendorInput.trim(); if (!value || selectedRule.vendors.some((item) => item.toLowerCase() === value.toLowerCase())) return; const vendors = [...selectedRule.vendors, value]; updateRule({ vendors, vendor: vendors[0] || null }); setVendorInput(""); }}>Add</s-button></s-grid>{selectedRule.vendors.map((vendor) => <s-box key={vendor} border="base" borderRadius="base" padding="base"><s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center"><s-text type="strong">{vendor}</s-text><s-button variant="tertiary" disabled={busy} onClick={() => { const vendors = selectedRule.vendors.filter((item) => item !== vendor); updateRule({ vendors, vendor: vendors[0] || null }); }}>Remove</s-button></s-grid></s-box>)}</s-stack>}
            {selectedRule.sourceType === "product" && <s-stack gap="small"><s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end"><s-text-field label="Search products" value="" readOnly error={fieldError(basePath + ".products")} /><s-button disabled={busy} onClick={() => void chooseProduct()}>Browse</s-button></s-grid>{selectedRule.products.map((product) => <s-box key={product.id} border="base" borderRadius="base" padding="base"><s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">{product.imageUrl ? <s-thumbnail src={product.imageUrl} alt={product.title} size="small" /> : <s-box inlineSize="40px"><s-icon type="product" /></s-box>}<s-text type="strong">{product.title}</s-text><s-button variant="tertiary" disabled={busy} onClick={() => { const products = selectedRule.products.filter((item) => item.id !== product.id); updateRule({ products, productId: products[0]?.id || null, productTitle: products[0]?.title || null }); }}>Remove</s-button></s-grid></s-box>)}</s-stack>}
          </s-stack></s-section>
          <s-section heading="Questions"><s-stack gap="base">
            {effectiveCreateMode && templateCatalogError && <s-banner tone="critical">{templateCatalogError} Select another template or retry; no incomplete rule has been saved.</s-banner>}
            {effectiveCreateMode && templateCatalog?.warnings.map((warning) => <s-banner key={warning} tone="warning">{warning}</s-banner>)}
            <s-paragraph>These questions are used only for the selected rule. Drag to reorder; active questions need at least two answers.</s-paragraph>
            {fieldError(basePath + ".questions") && <s-banner tone="critical">{shownError}</s-banner>}
            {selectedRule.questions.length ? <ComparisonRowList order={selectedRule.questions.map((question) => question.id)} customRows={selectedRule.questions.map((question, index) => ({ id: question.id, label: question.question || "Question " + (index + 1) }))} disabledRows={selectedRule.questions.filter((question) => !question.enabled).map((question) => question.id)} saving={busy} onOrderChange={(order) => updateRule({ questions: order.map((id) => selectedRule.questions.find((question) => question.id === id)!) })} onDisabledChange={(disabled) => updateRule({ questions: selectedRule.questions.map((question) => ({ ...question, enabled: !disabled.includes(question.id) })) })} onRemove={(id) => { updateRule({ questions: selectedRule.questions.filter((question) => question.id !== id) }); if (editingQuestionId === id) setEditingQuestionId(null); }} onEdit={setEditingQuestionId} /> : <s-paragraph>No questions yet. Add one to configure this quiz.</s-paragraph>}
            <s-button disabled={busy || selectedRule.questions.length >= 20 || (access.entitlements.finderQuestionLimit !== null && selectedRule.questions.length >= access.entitlements.finderQuestionLimit)} onClick={addQuestion}>Add question</s-button>
          </s-stack></s-section>
          {editingQuestionId && selectedRule.questions.map((question, index) => ({ question, index })).filter((item) => item.question.id === editingQuestionId).map(({ question, index }) => <FinderQuestionEditor key={question.id} question={question} index={index} busy={busy} basePath={basePath + ".questions." + index} errorField={shownField} errorMessage={shownError} onChange={updateQuestion} onClose={() => setEditingQuestionId(null)} catalog={templateCatalog} />)}
        </s-stack>
        <div style={{ position: "sticky", top: 16, alignSelf: "start" }}><FinderLivePreview draft={draft} rule={selectedRule} /></div>
      </s-grid>
      <s-modal id="finder-general-settings-modal" heading="General settings">
        <s-stack gap="base">
          <s-text-field label="Finder title" value={draft.title} error={fieldError("title")} disabled={busy} onInput={(event) => update({ title: event.currentTarget.value })} />
          <s-number-field label="Products to recommend (1–10)" min={1} max={10} step={1} value={String(draft.recommendationLimit)} error={fieldError("recommendationLimit")} disabled={busy} onInput={(event) => update({ recommendationLimit: event.currentTarget.value === "" ? 0 : Number(event.currentTarget.value) })} />
          <s-divider />
          <s-heading>Modal appearance</s-heading>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            <s-color-field label="Background" value={draft.modalBackground} error={fieldError("modalBackground")} disabled={busy} onInput={(event) => update({ modalBackground: event.currentTarget.value })} />
            <s-color-field label="Text" value={draft.modalTextColor} error={fieldError("modalTextColor")} disabled={busy} onInput={(event) => update({ modalTextColor: event.currentTarget.value })} />
            <s-color-field label="Accent" value={draft.modalAccentColor} error={fieldError("modalAccentColor")} disabled={busy} onInput={(event) => update({ modalAccentColor: event.currentTarget.value })} />
          </s-grid>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            <s-number-field label="Corner radius" details="Pixels" min={0} max={40} step={1} value={String(draft.modalBorderRadius)} error={fieldError("modalBorderRadius")} disabled={busy} onInput={(event) => update({ modalBorderRadius: Number(event.currentTarget.value) })} />
            <s-number-field label="Title size" details="Pixels" min={20} max={48} step={1} value={String(draft.modalTitleSize)} error={fieldError("modalTitleSize")} disabled={busy} onInput={(event) => update({ modalTitleSize: Number(event.currentTarget.value) })} />
            <s-number-field label="Question size" details="Pixels" min={14} max={32} step={1} value={String(draft.modalQuestionSize)} error={fieldError("modalQuestionSize")} disabled={busy} onInput={(event) => update({ modalQuestionSize: Number(event.currentTarget.value) })} />
          </s-grid>
          <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
            <s-number-field label="Modal padding" details="Pixels" min={16} max={48} step={1} value={String(draft.modalPadding)} error={fieldError("modalPadding")} disabled={busy} onInput={(event) => update({ modalPadding: Number(event.currentTarget.value) })} />
            <s-number-field label="Answer card padding" details="Pixels" min={8} max={32} step={1} value={String(draft.answerPadding)} error={fieldError("answerPadding")} disabled={busy} onInput={(event) => update({ answerPadding: Number(event.currentTarget.value) })} />
          </s-grid>
          <s-divider />
          <s-heading>No matching products screen</s-heading>
          <s-text-field label="Heading" value={draft.noMatchHeading} error={fieldError("noMatchHeading")} disabled={busy} onInput={(event) => update({ noMatchHeading: event.currentTarget.value })} />
          <s-text-area label="Description" rows={3} maxLength={500} value={draft.noMatchDescription} error={fieldError("noMatchDescription")} disabled={busy} onInput={(event) => update({ noMatchDescription: event.currentTarget.value })} />
        </s-stack>
        <s-button slot="primary-action" variant="primary" commandFor="finder-general-settings-modal">Done</s-button>
      </s-modal>
      <s-modal id="finder-button-settings-modal" heading="Storefront button settings">
        <s-stack gap="base">
          <s-text-field label="Button text" value={draft.buttonText.slice(0, 22)} maxLength={22} error={fieldError("buttonText")} disabled={busy} onInput={(event) => update({ buttonText: event.currentTarget.value.slice(0, 22) })} />
          <s-select label="Button position" value={draft.buttonPosition} error={fieldError("buttonPosition")} disabled={busy} onChange={(event) => update({ buttonPosition: event.currentTarget.value })}><s-option value="bottom_left">Bottom left</s-option><s-option value="bottom_center">Bottom center</s-option><s-option value="center_right">Center right</s-option><s-option value="center_left">Center left</s-option><s-option value="top_center">Top center</s-option></s-select>
          <s-divider />
          <s-heading>Button appearance</s-heading>
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            <s-color-field label="Background" value={draft.buttonBackground} error={fieldError("buttonBackground")} disabled={busy} onInput={(event) => update({ buttonBackground: event.currentTarget.value })} />
            <s-color-field label="Text and icon" value={draft.buttonTextColor} error={fieldError("buttonTextColor")} disabled={busy} onInput={(event) => update({ buttonTextColor: event.currentTarget.value })} />
            <s-color-field label="Border" value={draft.buttonBorderColor} error={fieldError("buttonBorderColor")} disabled={busy} onInput={(event) => update({ buttonBorderColor: event.currentTarget.value })} />
          </s-grid>
          <s-number-field label="Font size" details="Pixels" min={11} max={24} step={1} value={String(draft.buttonFontSize)} error={fieldError("buttonFontSize")} disabled={busy} onInput={(event) => update({ buttonFontSize: Number(event.currentTarget.value) })} />
          <s-stack direction="inline" gap="base"><s-switch label="Show on desktop" checked={draft.showDesktop} error={fieldError("showDesktop")} disabled={busy} onChange={(event) => update({ showDesktop: event.currentTarget.checked })} /><s-switch label="Show on mobile" checked={draft.showMobile} disabled={busy} onChange={(event) => update({ showMobile: event.currentTarget.checked })} /></s-stack>
        </s-stack>
        <s-button slot="primary-action" variant="primary" commandFor="finder-button-settings-modal">Done</s-button>
      </s-modal>
    </s-stack>
  </s-page>;
}
