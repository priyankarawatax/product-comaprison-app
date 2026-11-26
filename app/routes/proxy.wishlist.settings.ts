import type { LoaderFunctionArgs } from "react-router";
import { resolveWishlistStore, response, verifiedProxyContext } from "../wishlist/api.server";
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return response(405);
  try { const auth = await verifiedProxyContext(request); if (!auth) return response(403, { error: "Unauthorized" }); const store = await resolveWishlistStore(auth.shop); if (!store) return response(404, { error: "Store not found" });
    if (!store.settings.enabled) return response(200, { enabled: false });
    const { button, page, text, general } = store.settings;
    return response(200, { enabled: true, general, button, page, text, customerAuthenticated: Boolean(auth.customerId) });
  } catch { return response(503, { error: "Wishlist unavailable" }); }
}
