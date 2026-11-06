import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Pickwise: Product Compare</h1>
        <p className={styles.text}>
          Help shoppers compare products and find the right option for them.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Product comparison</strong>. Let shoppers compare product
            details, variants, prices, and merchant-selected metafields.
          </li>
          <li>
            <strong>Product Finder</strong>. Guide shoppers to relevant products
            with configurable questions and answers.
          </li>
          <li>
            <strong>Merchant analytics</strong>. Review comparison and Product
            Finder interactions from the embedded Shopify app.
          </li>
        </ul>
      </div>
    </div>
  );
}
