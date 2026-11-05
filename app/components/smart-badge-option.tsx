import { useState } from "react";

export type SmartBadgeKey = "lowestPrice" | "bestRated" | "mostPopular" | "bestValue";
export type SmartBadgeLabelKey = `${SmartBadgeKey}Label`;

type Settings = { enabled: boolean } & Record<SmartBadgeKey, boolean> & Record<SmartBadgeLabelKey, string>;

function checkedValue(value: unknown, current: boolean) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return !current;
}

export function SmartBadgeOption({ badgeKey, labelKey, settings, saving, onChange }: { badgeKey: SmartBadgeKey; labelKey: SmartBadgeLabelKey; settings: Settings; saving: boolean; onChange: (patch: Partial<Settings>) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const label = settings[labelKey];
  const checkbox = <s-checkbox label={renaming ? `Enable ${label}` : label} labelAccessibilityVisibility={renaming ? "exclusive" : "visible"} checked={settings[badgeKey]} disabled={saving || !settings.enabled} onChange={(event) => onChange({ [badgeKey]: checkedValue(event.currentTarget.checked, settings[badgeKey]) })} />;
  if (renaming) return <s-grid gridTemplateColumns="auto minmax(160px, 1fr) auto" gap="small" alignItems="end">
    {checkbox}
    <s-text-field label={`Rename ${label}`} labelAccessibilityVisibility="exclusive" value={draftLabel} maxLength={40} disabled={saving} onInput={(event) => setDraftLabel(event.currentTarget.value)} />
    <s-button variant="primary" disabled={saving || !draftLabel.trim() || draftLabel.trim().length > 40} onClick={() => { const next = draftLabel.trim(); if (!next || next.length > 40) return; onChange({ [labelKey]: next }); setRenaming(false); }}>Save</s-button>
  </s-grid>;
  return <s-stack direction="inline" gap="small" alignItems="center">{checkbox}<s-button icon="edit" variant="tertiary" disabled={saving} accessibilityLabel={`Rename ${label}`} onClick={() => { setDraftLabel(label); setRenaming(true); }}></s-button></s-stack>;
}
