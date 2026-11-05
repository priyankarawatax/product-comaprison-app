export type ReviewSource = "auto" | "standard" | "custom";
export type ReviewSettings = {
  source: ReviewSource;
  ratingNamespace: string;
  ratingKey: string;
  countNamespace: string;
  countKey: string;
  maxScale: number;
};

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  source: "standard",
  ratingNamespace: "",
  ratingKey: "",
  countNamespace: "",
  countKey: "",
  maxScale: 5,
};

const identifier = /^[A-Za-z0-9_-]{3,255}$/;
const key = /^[A-Za-z0-9_-]{3,64}$/;

export function isReviewSettings(value: unknown): value is ReviewSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  if (!["auto", "standard", "custom"].includes(String(settings.source))) return false;
  const maxScale = Number(settings.maxScale);
  if (!Number.isFinite(maxScale) || maxScale < 1 || maxScale > 10) return false;
  const fields = [settings.ratingNamespace, settings.ratingKey, settings.countNamespace, settings.countKey];
  const empty = fields.every((entry) => entry === "");
  const valid = identifier.test(String(settings.ratingNamespace)) && key.test(String(settings.ratingKey)) && identifier.test(String(settings.countNamespace)) && key.test(String(settings.countKey));
  return settings.source === "standard" ? empty || valid : settings.source === "auto" ? empty || valid : valid;
}

export function readReviewSettings(value?: string | null): ReviewSettings {
  try {
    const parsed: unknown = JSON.parse(value || "null");
    if (isReviewSettings(parsed)) return { ...parsed, maxScale: Number(parsed.maxScale) };
  } catch { /* Use automatic standard review detection. */ }
  return { ...DEFAULT_REVIEW_SETTINGS };
}
