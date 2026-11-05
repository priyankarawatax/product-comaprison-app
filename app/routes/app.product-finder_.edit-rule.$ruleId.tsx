import { useParams } from "react-router";
import ProductFinder, { action, loader } from "./app.product-finder";

export { action, loader };

export default function EditProductFinderRule() {
  const { ruleId } = useParams();
  return <ProductFinder ruleId={ruleId} />;
}
