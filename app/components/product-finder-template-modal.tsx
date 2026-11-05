import { PRODUCT_FINDER_TEMPLATES, type ProductFinderTemplateId } from "../product-finder/templates";

type TemplatePickerProps = {
  busy: boolean;
  selectingTemplateId: ProductFinderTemplateId | null;
  onSelect: (templateId: ProductFinderTemplateId) => void;
};

const TEMPLATE_CARD_THEMES: Record<ProductFinderTemplateId, { color: string; softColor: string }> = {
  "quick-product-finder": { color: "#0f766daf", softColor: "#CCFBF1" },
  "fashion-style-finder": { color: "#7c3aeda6", softColor: "#EDE9FE" },
  "gift-finder": { color: "#c2400cab", softColor: "#FFEDD5" },
  "feature-specification-finder": { color: "#1d4fd8a2", softColor: "#DBEAFE" },
  "collection-budget-finder": { color: "#a16107a1", softColor: "#FEF3C7" },
  "custom-product-finder": { color: "#be185da6", softColor: "#FCE7F3" },
};

export function ProductFinderTemplateCards({ busy, selectingTemplateId, onSelect }: TemplatePickerProps & { closeModal?: boolean }) {
  return <s-query-container>
    <s-grid gridTemplateColumns="@container (inline-size > 400px) 1fr 1fr 1fr, 1fr" gap="base">
      {PRODUCT_FINDER_TEMPLATES.map((template) => {
        const theme = TEMPLATE_CARD_THEMES[template.id];
        const selecting = selectingTemplateId === template.id;
        return <s-box key={template.id} border="base" borderRadius="base" padding="base">
          <s-stack gap="base">
            <s-stack direction="inline" gap="small" alignItems="center">
              <span style={{ color: theme.color }}><s-icon type={template.icon}></s-icon></span>
              <s-heading><span style={{ color: theme.color }}>{template.name}</span></s-heading>
            </s-stack>
            <s-paragraph color="subdued">{template.description}</s-paragraph>
            <button
              type="button"
              disabled={busy && !selecting}
              aria-busy={selecting}
              onClick={() => onSelect(template.id)}
              style={{
                alignSelf: "flex-start",
                background: theme.color,
                border: `1px ${theme.color}`,
                borderRadius: 8,
                color: "#FFFFFF",
                cursor: busy && !selecting ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 650,
                padding: "4px 10px",
              }}
            >{selecting ? "Opening..." : "Select Template"}</button>
          </s-stack>
        </s-box>;
      })}
    </s-grid>
  </s-query-container>;
}

export function ProductFinderTemplateModal({ busy, selectingTemplateId, onSelect }: TemplatePickerProps) {
  return <s-modal id="product-finder-template-modal" heading="Choose a Product Finder Template" size="large">
    <s-stack gap="base">
      <s-paragraph>Start with a ready-made template or create your own.</s-paragraph>
      <ProductFinderTemplateCards busy={busy} selectingTemplateId={selectingTemplateId} onSelect={onSelect} closeModal />
    </s-stack>
    <s-button slot="secondary-actions" disabled={busy} commandFor="product-finder-template-modal" command="--hide">Cancel</s-button>
  </s-modal>;
}
