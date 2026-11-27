import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { defaultWishlistSettings, type WishlistSettingsDraft } from "./config";

type SettingsRow = { enabled: boolean; generalSettings: unknown; buttonSettings: unknown; pageSettings: unknown; textSettings: unknown; setupGuideDismissed: boolean };
const toDraft = (row: SettingsRow): WishlistSettingsDraft => ({ enabled: row.enabled, general: { ...defaultWishlistSettings.general, ...(row.generalSettings as WishlistSettingsDraft["general"]) }, button: { ...defaultWishlistSettings.button, ...(row.buttonSettings as Partial<WishlistSettingsDraft["button"]>) }, page: { ...defaultWishlistSettings.page, ...(row.pageSettings as Partial<WishlistSettingsDraft["page"]>) }, text: { ...defaultWishlistSettings.text, ...(row.textSettings as Partial<WishlistSettingsDraft["text"]>) }, setupGuideDismissed: row.setupGuideDismissed });

export async function getWishlistSettings(shop: string) {
  const store = await db.store.findUnique({ where: { shop }, select: { wishlistSettings: true } });
  if (!store) throw new Error("Store installation not found.");
  return store.wishlistSettings ? toDraft(store.wishlistSettings) : structuredClone(defaultWishlistSettings);
}

export async function saveWishlistSettings(shop: string, value: WishlistSettingsDraft) {
  const store = await db.store.findUnique({ where: { shop }, select: { id: true } });
  if (!store) throw new Error("Store installation not found.");
  const fields = { enabled: value.enabled, generalSettings: value.general as Prisma.InputJsonValue, buttonSettings: value.button as Prisma.InputJsonValue, pageSettings: value.page as Prisma.InputJsonValue, textSettings: value.text as Prisma.InputJsonValue, setupGuideDismissed: value.setupGuideDismissed };
  return toDraft(await db.wishlistSettings.upsert({ where: { storeId: store.id }, create: { storeId: store.id, ...fields }, update: fields }));
}

export const resetWishlistSettings = (shop: string) => saveWishlistSettings(shop, structuredClone(defaultWishlistSettings));
export async function updateWishlistSetupGuide(shop: string, dismissed: boolean) { return saveWishlistSettings(shop, { ...(await getWishlistSettings(shop)), setupGuideDismissed: dismissed }); }
