import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { FeatureRequest } from "../components/feature-request";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/app/billing")) {
    const store = await db.store.findUnique({
      where: { shop: session.shop },
      select: { billingSelectionRequired: true },
    });
    if (store?.billingSelectionRequired) {
      throw redirect("/app/billing?reinstall=1");
    }
  }
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/analytics">Analytics</Link>
        <Link to="/app/table-settings">Table settings</Link>
        <Link to="/app/product-finder">Product Finder</Link>
        <Link to="/app/billing">Plans & Billing</Link>
      </NavMenu>
      <FeatureRequest />
      <Outlet />
    </AppProvider>
  );
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
