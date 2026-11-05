import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getFinder } from "../product-finder/finder.server";
import { selectedRules, rankMatchingProducts, FinderRequestError } from "../product-finder/scoring";
import { allowFinderRequest, loadFinderCatalog } from "../product-finder/catalog.server";
import { getStorePlanAccess } from "../billing/entitlements.server";
import { defaultFinder } from "../product-finder/config";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function resourceGid(type: "Collection" | "Product", value: string | null) { return value && /^[1-9][0-9]{0,19}$/.test(value) ? "gid://shopify/" + type + "/" + value : null; }
function collectionGids(value: string | null) {
  return [...new Set((value || "").split(",").slice(0, 50).map((id) => resourceGid("Collection", id.trim())).filter((id): id is string => Boolean(id)))];
}
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return new Response(null, { status: 405, headers });
  try {
    const { session } = await authenticate.public.appProxy(request); const query = new URL(request.url).searchParams; const timestamp = Number(query.get("timestamp"));
    if (!session?.shop || query.get("shop") !== session.shop || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return Response.json({ enabled: false }, { status: 403, headers });
    const store = await db.store.findUnique({ where: { shop: session.shop, uninstalledAt: null }, select: { shop: true, productFinder: { select: { id: true } } } });
    if (!store?.productFinder) return Response.json({ enabled: false }, { headers });
    const finder = await getFinder(store.shop); const access = await getStorePlanAccess(store.shop); const runtimeRules = access.entitlements.productFinderLimit === null ? finder.ruleSets.filter((entry) => entry.enabled) : finder.ruleSets.filter((entry) => entry.enabled).slice(0, access.entitlements.productFinderLimit); const requestedCollections = collectionGids(query.get("collection_ids") || query.get("collection_id")); const requestedProduct = resourceGid("Product", query.get("product_id")); const requestedVendor = (query.get("vendor") || "").trim().slice(0, 255);
    const rule = runtimeRules.find((entry) => requestedProduct && entry.products.some((item) => item.id === requestedProduct)) || runtimeRules.find((entry) => requestedCollections.some((collectionId) => entry.collections.some((item) => item.id === collectionId))) || runtimeRules.find((entry) => requestedVendor && entry.vendors.some((item) => item.toLocaleLowerCase() === requestedVendor.toLocaleLowerCase())) || runtimeRules.find((entry) => entry.sourceType === "all_products");
    const enabledQuestions = rule?.questions.filter((question) => question.enabled) || []; const questions = access.entitlements.finderQuestionLimit === null ? enabledQuestions : enabledQuestions.slice(0, access.entitlements.finderQuestionLimit);
    if ((!finder.showDesktop && !finder.showMobile) || !rule || !questions.length || questions.some((question) => question.answers.length < 2)) return Response.json({ enabled: false }, { headers });
    const appearance = access.entitlements.advancedCustomization ? finder : defaultFinder();
    return Response.json({ enabled: true, id: String(store.productFinder.id), version: finder.version, ruleSetId: rule.id, title: finder.title, description: finder.description, buttonText: finder.buttonText, buttonPosition: finder.buttonPosition, showDesktop: finder.showDesktop, showMobile: finder.showMobile, appearance: { modalBackground: appearance.modalBackground, modalTextColor: appearance.modalTextColor, modalAccentColor: appearance.modalAccentColor, modalBorderRadius: appearance.modalBorderRadius, modalTitleSize: appearance.modalTitleSize, modalQuestionSize: appearance.modalQuestionSize, buttonBackground: appearance.buttonBackground, buttonTextColor: appearance.buttonTextColor, buttonBorderColor: appearance.buttonBorderColor, buttonFontSize: appearance.buttonFontSize, modalPadding: appearance.modalPadding, answerPadding: appearance.answerPadding }, noMatchHeading: finder.noMatchHeading, noMatchDescription: finder.noMatchDescription, questions: questions.map((question) => ({ id: question.id, question: question.question, selectionMode: question.selectionMode === "multiple" ? "multiple" : "single", answers: question.answers.map((answer) => ({ id: answer.id, label: answer.label })) })) }, { headers });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ enabled: false }, { status: 503, headers }); }
}
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  try {
    const { session, admin } = await authenticate.public.appProxy(request); const query = new URL(request.url).searchParams; const timestamp = Number(query.get("timestamp"));
    if (!session?.shop || !admin || query.get("shop") !== session.shop || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return Response.json({ error: "Invalid storefront request." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new FinderRequestError("Expected JSON.", 415);
    if (!allowFinderRequest(session.shop)) throw new FinderRequestError("Too many requests. Please try again shortly.", 429);
    const reader = request.body?.getReader(); if (!reader) throw new FinderRequestError("Missing quiz answers."); const chunks: Uint8Array[] = []; let size = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) { size += chunk.value.byteLength; if (size > 8192) { await reader.cancel(); throw new FinderRequestError("Quiz request is too large.", 413); } chunks.push(chunk.value); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new FinderRequestError("Invalid quiz answers."); }
    const store = await db.store.findUnique({ where: { shop: session.shop }, select: { shop: true, uninstalledAt: true, productFinder: { select: { id: true } } } });
    if (!store || store.uninstalledAt || !store.productFinder) throw new FinderRequestError("Product Finder is unavailable.", 403);
    const finder = await getFinder(store.shop); const access = await getStorePlanAccess(store.shop); if (!finder.showDesktop && !finder.showMobile) throw new FinderRequestError("Product Finder is unavailable.", 404);
    const ruleSetId = input && typeof input === "object" && !Array.isArray(input) ? (input as { ruleSetId?: unknown }).ruleSetId : null;
    const runtimeRules = access.entitlements.productFinderLimit === null ? finder.ruleSets.filter((entry) => entry.enabled) : finder.ruleSets.filter((entry) => entry.enabled).slice(0, access.entitlements.productFinderLimit);
    const rule = runtimeRules.find((entry) => entry.id === ruleSetId); if (!rule) throw new FinderRequestError("This quiz has changed. Refresh the page to start the latest quiz.", 409);
    const enabledQuestions = rule.questions.filter((question) => question.enabled); const runtimeQuestions = access.entitlements.finderQuestionLimit === null ? enabledQuestions : enabledQuestions.slice(0, access.entitlements.finderQuestionLimit);
    const selections = selectedRules(input, { id: String(store.productFinder.id), version: finder.version, questions: runtimeQuestions });
    const requestData = input as { page?: unknown; country?: unknown };
    const page = requestData.page === undefined ? 0 : requestData.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 0 || page > 1000) throw new FinderRequestError("Invalid results page.");
    const country = typeof requestData.country === "string" ? requestData.country.toUpperCase() : "US";
    const candidates = await loadFinderCatalog(admin, session.shop, { sourceType: rule.sourceType, collections: rule.collections, vendors: rule.vendors, products: rule.products }, finder.version, selections, country);
    const matched = rankMatchingProducts(candidates, selections, page * finder.recommendationLimit, finder.recommendationLimit);
    return Response.json({ heading: finder.resultHeading, ...matched, page }, { headers });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof FinderRequestError ? error.message : "Recommendations are temporarily unavailable. Please try again." }, { status: error instanceof FinderRequestError ? error.status : 503, headers }); }
}
