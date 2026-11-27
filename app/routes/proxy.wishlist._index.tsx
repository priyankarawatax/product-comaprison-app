import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { liquid } = await authenticate.public.appProxy(request);
  return liquid(
    `<main class="page-width pickwise-wishlist-page" data-pickwise-wishlist-page>
      <div class="pickwise-wishlist-page-mount" aria-live="polite">
        <h1>My Wishlist</h1>
      </div>
    </main>`,
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
