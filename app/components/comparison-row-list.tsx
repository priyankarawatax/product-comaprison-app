import { useEffect, useRef, useState } from "react";
import { COMPARISON_ROWS, moveRow } from "../comparison-rows";

type Props = {
  customRows?: { id: string; label: string }[];
  order: string[];
  disabledRows: string[];
  labels?: Record<string, string>;
  saving: boolean;
  lockedRows?: string[];
  onOrderChange: (order: string[]) => void;
  onDisabledChange: (disabled: string[]) => void;
  onLabelChange?: (id: string, label: string) => void;
  onRemove?: (id: string) => void;
  onEdit?: (id: string) => void;
};

export function ComparisonRowList(props: Props) {
  const current = useRef(props);
  current.current = props;
  const rows = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{ id: string; pointerId: number; original: string[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  useEffect(() => {
    function finish() { drag.current = null; setDragging(null); }
    function cancel() {
      if (drag.current) current.current.onOrderChange(drag.current.original);
      finish();
    }
    function move(event: PointerEvent) {
      const active = drag.current;
      const state = current.current;
      if (!active || active.pointerId !== event.pointerId || state.saving) return;
      event.preventDefault();
      const from = state.order.indexOf(active.id);
      for (const [id, node] of rows.current) {
        if (id === active.id) continue;
        const rect = node.getBoundingClientRect();
        const to = state.order.indexOf(id);
        const midpoint = rect.top + rect.height / 2;
        if (event.clientY >= rect.top && event.clientY <= rect.bottom &&
            (to > from ? event.clientY >= midpoint : event.clientY <= midpoint)) {
          state.onOrderChange(moveRow(state.order, active.id, id));
          setAnnouncement(`${[...COMPARISON_ROWS, ...(state.customRows || [])].find((row) => row.id === active.id)?.label} moved to position ${to + 1}.`);
          break;
        }
      }
    }
    function up(event: PointerEvent) { if (drag.current?.pointerId === event.pointerId) finish(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") cancel(); }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return <s-stack gap="base">
    {props.order.map((id, index) => {
      const defaultLabel = [...COMPARISON_ROWS, ...(props.customRows || [])].find((row) => row.id === id)?.label || id;
      const label = props.labels?.[id] || defaultLabel;
      const locked = props.lockedRows?.includes(id) ?? false;
      return <div key={id} data-row-id={id} ref={(node) => { if (node) rows.current.set(id, node); else rows.current.delete(id); }}>
        <s-box border="base" borderRadius="base" paddingInlineEnd="base" background={dragging === id ? "subdued" : "base"}>
          <s-stack direction="inline" justifyContent="space-between"  gap="base"  alignItems="center">
            <s-stack direction="inline" alignItems="center">
              <div role="button" tabIndex={props.saving || locked ? -1 : 0} aria-disabled={props.saving || locked}
                aria-label={`Drag ${label} to reorder. Use arrow keys to move.`}
                style={{ touchAction: "none" }}
                onPointerDown={(event) => {
                  if (props.saving || locked || event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  drag.current = { id, pointerId: event.pointerId, original: [...props.order] };
                  setDragging(id);
                }}
                onKeyDown={(event) => {
                  if (props.saving || locked) return;
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  const to = index + (event.key === "ArrowUp" ? -1 : 1);
                  if (props.order[to]) {
                    props.onOrderChange(moveRow(props.order, id, props.order[to]));
                    setAnnouncement(`${label} moved to position ${to + 1}.`);
                  }
                }}>
                <s-box padding="base"><s-text>⋮⋮</s-text></s-box>
              </div>
              {props.onLabelChange && renaming === id ? <s-grid gridTemplateColumns="minmax(180px, 1fr) auto" gap="small" alignItems="end">
                <s-text-field label={`Rename ${label}`} labelAccessibilityVisibility="exclusive" value={draftLabel} disabled={props.saving || locked} maxLength={40}
                  onInput={(event) => setDraftLabel(event.currentTarget.value)} />
                <s-button variant="primary" disabled={props.saving || locked || !draftLabel.trim() || draftLabel.trim().length > 40}
                  onClick={() => {
                    const nextLabel = draftLabel.trim();
                    if (!nextLabel || nextLabel.length > 40) return;
                    props.onLabelChange?.(id, nextLabel);
                    setRenaming(null);
                  }}>Save</s-button>
              </s-grid>
                : props.onEdit ? <s-button variant="tertiary" onClick={() => props.onEdit?.(id)}>{index + 1}. {label}</s-button> : <s-stack direction="inline" gap="small" alignItems="center">
                  <s-text>{index + 1}. {label}</s-text>
                  {props.onLabelChange && <s-button icon="edit" variant="tertiary" disabled={props.saving || locked}
                    accessibilityLabel={`Rename ${label}`} onClick={() => { setDraftLabel(label); setRenaming(id); }}></s-button>}
                </s-stack>}
            </s-stack>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-switch label={`Show ${label} on storefront`} labelAccessibilityVisibility="exclusive"
                checked={!props.disabledRows.includes(id)} disabled={props.saving || locked}
                onChange={(event) => {
                  const next = props.disabledRows.filter((row) => row !== id);
                  if (!event.currentTarget.checked) next.push(id);
                  props.onDisabledChange(next);
                }} />
              {props.onRemove && <s-button icon="delete" tone="critical" variant="tertiary" disabled={props.saving || locked}
                accessibilityLabel={`Remove ${label}`} onClick={() => props.onRemove?.(id)}>Remove</s-button>}
            </s-stack>
          </s-stack>
        </s-box>
      </div>;
    })}
    <div role="status" aria-live="polite">{announcement}</div>
  </s-stack>;
}
