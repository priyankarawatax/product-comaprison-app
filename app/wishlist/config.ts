export type WishlistSettingsDraft = {
  enabled: boolean;
  general: { showOnProductCards: boolean; showOnProductPages: boolean; allowGuests: boolean; allowCustomers: boolean; mergeAfterLogin: boolean };
  button: { type: "icon" | "text" | "icon_text"; iconStyle: "outline" | "filled"; defaultIconColor: string; activeIconColor: string; iconBackgroundColor: string; backgroundColor: string; textColor: string; borderColor: string; borderRadius: number; iconSize: number; padding: number; alignment: "left" | "center" | "right"; cardPosition: "top_left" | "top_right" | "bottom_left" | "bottom_right"; productPosition: "image_overlay" | "above_buy" | "below_buy" | "below_title" };
  page: { title: string; description: string; layout: "grid" | "list"; productsPerRow: 2 | 3 | 4 | 5; showImage: boolean; showTitle: boolean; showPrice: boolean; showAvailability: boolean; showAddToCart: boolean; showRemove: boolean; showContinueShopping: boolean; backgroundColor: string; textColor: string };
  text: { addToWishlist: string; addedToWishlist: string; removeFromWishlist: string; myWishlist: string; addToCart: string; continueShopping: string; outOfStock: string; emptyWishlist: string; addedSuccessfully: string; removedSuccessfully: string };
  setupGuideDismissed: boolean;
};

export const defaultWishlistSettings: WishlistSettingsDraft = {
  enabled: false,
  general: { showOnProductCards: true, showOnProductPages: true, allowGuests: true, allowCustomers: true, mergeAfterLogin: true },
  button: { type: "icon", iconStyle: "outline", defaultIconColor: "#FFFFFF", activeIconColor: "#FFFFFF", iconBackgroundColor: "#F2A078", backgroundColor: "#FFFFFF", textColor: "#202223", borderColor: "#C9CCCF", borderRadius: 8, iconSize: 20, padding: 12, alignment: "center", cardPosition: "top_right", productPosition: "image_overlay" },
  page: { title: "My Wishlist", description: "", layout: "grid", productsPerRow: 4, showImage: true, showTitle: true, showPrice: true, showAvailability: true, showAddToCart: true, showRemove: true, showContinueShopping: true, backgroundColor: "#FFFFFF", textColor: "#202223" },
  text: { addToWishlist: "Add to Wishlist", addedToWishlist: "Added to Wishlist", removeFromWishlist: "Remove from Wishlist", myWishlist: "My Wishlist", addToCart: "Add to Cart", continueShopping: "Continue Shopping", outOfStock: "Out of Stock", emptyWishlist: "Your wishlist is empty", addedSuccessfully: "Product added successfully", removedSuccessfully: "Product removed successfully" },
  setupGuideDismissed: false,
};

const color = /^#[0-9A-F]{6}$/i;
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string | number>(v: unknown, values: readonly T[]): v is T => values.includes(v as T);
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validateWishlistSettings(input: unknown): { data?: WishlistSettingsDraft; error?: string } {
  if (!object(input) || !object(input.general) || !object(input.button) || !object(input.page) || !object(input.text)) return { error: "Invalid Wishlist settings." };
  const v = input as unknown as WishlistSettingsDraft;
  if (![v.enabled, v.setupGuideDismissed, ...Object.values(v.general)].every((x) => typeof x === "boolean")) return { error: "Invalid general settings." };
  if (!oneOf(v.button.type, ["icon", "text", "icon_text"] as const) || !oneOf(v.button.iconStyle, ["outline", "filled"] as const) || !oneOf(v.button.alignment, ["left", "center", "right"] as const) || !oneOf(v.button.cardPosition, ["top_left", "top_right", "bottom_left", "bottom_right"] as const) || !oneOf(v.button.productPosition, ["image_overlay", "above_buy", "below_buy", "below_title"] as const)) return { error: "Invalid button option." };
  if (![v.button.defaultIconColor, v.button.activeIconColor, v.button.iconBackgroundColor, v.button.backgroundColor, v.button.textColor, v.button.borderColor, v.page.backgroundColor, v.page.textColor].every((x) => typeof x === "string" && color.test(x))) return { error: "Colors must use six-digit hex values." };
  if (!Number.isInteger(v.button.borderRadius) || v.button.borderRadius < 0 || v.button.borderRadius > 40 || !Number.isInteger(v.button.iconSize) || v.button.iconSize < 12 || v.button.iconSize > 48 || !Number.isInteger(v.button.padding) || v.button.padding < 4 || v.button.padding > 32) return { error: "Button sizing is outside the allowed range." };
  if (!oneOf(v.page.layout, ["grid", "list"] as const) || !oneOf(v.page.productsPerRow, [2, 3, 4, 5] as const) || ![v.page.showImage, v.page.showTitle, v.page.showPrice, v.page.showAvailability, v.page.showAddToCart, v.page.showRemove, v.page.showContinueShopping].every((x) => typeof x === "boolean")) return { error: "Invalid Wishlist page settings." };
  if (!text(v.page.title, 120) || typeof v.page.description !== "string" || v.page.description.length > 500 || !Object.values(v.text).every((x) => text(x, 120))) return { error: "Text labels are required and must be 120 characters or fewer." };
  return { data: v };
}
