import ProductFinder, { action, loader } from "./app.product-finder";

export { action, loader };

export default function CreateProductFinderRule() {
  return <ProductFinder createMode />;
}
