import { fieldKind, operatorsFor, type FinderQuestion, type FinderAnswer } from "../product-finder/config";
import { createCatalogAnswers, type FinderTemplateCatalog, type ProductFinderMappingType } from "../product-finder/templates";
const fields = [["price", "Price"], ["vendor", "Vendor"], ["product_type", "Product type"], ["tags", "Tags"], ["availability", "Availability"], ["variant_option", "Variant option"], ["metafield", "Product metafield"]];
export function newAnswer(): FinderAnswer { return { id: crypto.randomUUID(), label: "", field: "price", operator: "less_than_or_equal", value: "", weight: 1 }; }
export function FinderQuestionEditor({ question, index, busy, onChange, onClose, basePath, errorField, errorMessage, catalog }: {
  question: FinderQuestion; index: number; busy: boolean; onChange: (question: FinderQuestion) => void; onClose: () => void;
  basePath: string; errorField: string | null; errorMessage: string; catalog?: FinderTemplateCatalog | null;
}) {
  const error = (path: string) => errorField === path ? errorMessage : undefined;
  const updateAnswer = (id: string, change: Partial<FinderAnswer>) => onChange({ ...question, answers: question.answers.map((answer) => answer.id === id ? { ...answer, ...change } : answer) });
  const move = (answerIndex: number, direction: number) => { const answers = [...question.answers]; [answers[answerIndex], answers[answerIndex + direction]] = [answers[answerIndex + direction], answers[answerIndex]]; onChange({ ...question, answers }); };
  const mappingOptions = catalog ? [
    { value: "product_type", label: "Product type" }, { value: "vendor", label: "Vendor" }, { value: "price", label: "Price" }, { value: "availability", label: "Availability" }, { value: "collection", label: "Collection" }, { value: "tags", label: "Product tags" },
    ...Object.keys(catalog.options).map((name) => ({ value: "variant_option." + name, label: "Variant option: " + name })),
    ...catalog.metafields.map((item) => ({ value: "metafield." + item.key, label: "Metafield: " + item.name + " (" + item.key + ")" })),
  ] : [];
  const changeMapping = (fieldKey: string) => {
    const mappingType: ProductFinderMappingType = fieldKey.startsWith("variant_option.") ? "variant_option" : fieldKey.startsWith("metafield.") ? "metafield" : fieldKey as ProductFinderMappingType;
    const answers = catalog ? createCatalogAnswers(catalog, mappingType, fieldKey) : [];
    onChange({ ...question, mappingType, fieldKey: fieldKey || null, enabled: question.required ? answers.length >= 2 : question.enabled && answers.length >= 2, answers });
  };
  return <s-section heading={"Question " + (index + 1)}>
    <s-stack gap="base">
      <s-stack direction="inline" justifyContent="space-between" alignItems="center">
        <s-badge tone={question.enabled ? "success" : "neutral"}>{question.enabled ? "Active" : "Inactive"}</s-badge>
        <s-button disabled={busy} onClick={onClose}>Close</s-button>
      </s-stack>
      <>
        <s-text-field label="Question text" value={question.question} error={error(basePath + ".question")} disabled={busy} onInput={(event) => onChange({ ...question, question: event.currentTarget.value })} />
        <s-select label="Answer selection" value={question.selectionMode === "multiple" ? "multiple" : "single"} disabled={busy} onChange={(event) => onChange({ ...question, selectionMode: event.currentTarget.value === "multiple" ? "multiple" : "single" })}><s-option value="single">Single choice</s-option><s-option value="multiple">Multiple choice</s-option></s-select>
        {question.required && (!question.fieldKey || question.answers.length < 2) && <s-banner tone="warning">This required question needs a Shopify field mapping with at least two actual catalog values before publishing.</s-banner>}
        {catalog && <s-select label="Shopify field mapping" value={question.fieldKey || ""} disabled={busy} onChange={(event) => changeMapping(event.currentTarget.value)}><s-option value="">Select a catalog field</s-option>{mappingOptions.map((option) => <s-option key={option.value} value={option.value}>{option.label}</s-option>)}</s-select>}
        {errorField === basePath + ".answers" && <s-banner tone="critical">{errorMessage}</s-banner>}
        {question.answers.map((answer, answerIndex) => { const kind = fieldKind(answer.field); const answerPath = basePath + ".answers." + answerIndex; return <s-box key={answer.id} padding="base" border="base" borderRadius="base" background="subdued">
          <s-stack gap="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center"><s-heading>{"Answer " + (answerIndex + 1)}</s-heading><s-stack direction="inline" gap="small"><s-button disabled={busy || answerIndex === 0} accessibilityLabel={"Move answer " + (answerIndex + 1) + " up"} onClick={() => move(answerIndex, -1)}>↑</s-button><s-button disabled={busy || answerIndex === question.answers.length - 1} accessibilityLabel={"Move answer " + (answerIndex + 1) + " down"} onClick={() => move(answerIndex, 1)}>↓</s-button><s-button disabled={busy} onClick={() => onChange({ ...question, answers: question.answers.filter((entry) => entry.id !== answer.id) })}>Remove answer</s-button></s-stack></s-stack>
            <s-text-field label="Answer label" value={answer.label} error={error(answerPath + ".label")} disabled={busy} onInput={(event) => updateAnswer(answer.id, { label: event.currentTarget.value })} />
            <s-select label="Product field" value={kind} error={error(answerPath + ".field")} disabled={busy} onChange={(event) => { const nextKind = event.currentTarget.value; const field = nextKind === "metafield" ? "metafield." : nextKind === "variant_option" ? "variant_option." : nextKind; updateAnswer(answer.id, { field, operator: "equals", value: nextKind === "availability" ? "true" : "" }); }}>{fields.map(([value, label]) => <s-option key={value} value={value}>{label}</s-option>)}</s-select>
            {kind === "metafield" && <s-text-field label="Metafield namespace.key" placeholder="custom.material" value={answer.field.slice("metafield.".length)} error={error(answerPath + ".field")} disabled={busy} onInput={(event) => updateAnswer(answer.id, { field: "metafield." + event.currentTarget.value })} />}
            {kind === "variant_option" && <s-text-field label="Variant option name" placeholder="Color" value={answer.field.slice("variant_option.".length)} error={error(answerPath + ".field")} disabled={busy} onInput={(event) => updateAnswer(answer.id, { field: "variant_option." + event.currentTarget.value })} />}
            <s-select label="Operator" value={answer.operator} error={error(answerPath + ".operator")} disabled={busy} onChange={(event) => updateAnswer(answer.id, { operator: event.currentTarget.value })}>{operatorsFor(answer.field).map((operator) => <s-option key={operator} value={operator}>{operator.replaceAll("_", " ")}</s-option>)}</s-select>
            {kind === "availability" ? <s-select label="Match value" value={answer.value} error={error(answerPath + ".value")} disabled={busy} onChange={(event) => updateAnswer(answer.id, { value: event.currentTarget.value })}><s-option value="true">Available</s-option><s-option value="false">Sold out</s-option></s-select> : <s-text-field label={kind === "price" ? "Match value (store currency, e.g. 500)" : "Match value"} value={answer.value} error={error(answerPath + ".value")} disabled={busy} onInput={(event) => updateAnswer(answer.id, { value: event.currentTarget.value })} />}
            <s-number-field label="Weight (1–100)" min={1} max={100} step={1} value={String(answer.weight)} error={error(answerPath + ".weight")} disabled={busy} onInput={(event) => updateAnswer(answer.id, { weight: event.currentTarget.value === "" ? 0 : Number(event.currentTarget.value) })} />
          </s-stack></s-box>; })}
        <s-button disabled={busy || question.answers.length >= 20} onClick={() => onChange({ ...question, answers: [...question.answers, { ...newAnswer(), field: question.fieldKey || question.answers[0]?.field || "price", operator: question.mappingType === "tags" ? "contains" : "equals" }] })}>Add answer</s-button>
      </>
    </s-stack>
  </s-section>;
}

