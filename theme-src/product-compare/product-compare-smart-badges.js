export const BADGE_PRIORITY = ["best_value", "lowest_price", "best_rated", "most_popular"];

export const BADGE_LABELS = {
  best_value: "Best Value",
  lowest_price: "Lowest Price",
  best_rated: "Best Rated",
  most_popular: "Most Popular",
};

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function winners(entries, score, direction = "max") {
  const scored = entries.map((item) => ({ item, value: score(item) })).filter(({ value }) => finite(value));
  if (!scored.length) return [];
  const winning = direction === "min"
    ? Math.min(...scored.map(({ value }) => value))
    : Math.max(...scored.map(({ value }) => value));
  return scored.filter(({ value }) => Math.abs(value - winning) < 1e-9).map(({ item }) => item);
}

function normalizedMetric(items, read, inverse = false) {
  const values = items.map(read).filter(finite);
  if (values.length !== items.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return null;
  return new Map(items.map((item) => {
    const normalized = (read(item) - min) / (max - min);
    return [item.key, inverse ? 1 - normalized : normalized];
  }));
}

export function calculateComparisonBadges(products, settings = {}, popularity = {}) {
  const items = Array.isArray(products) ? products.filter((item) => item && typeof item.key === "string") : [];
  const result = Object.fromEntries(items.map((item) => [item.key, []]));
  if (!settings.enabled || items.length < 2) return result;
  const award = (badge, awarded) => {
    for (const item of awarded) result[item.key].push(badge);
  };

  if (settings.lowestPrice) {
    award("lowest_price", winners(items, (item) => finite(item.priceAmount) && item.priceAmount >= 0 ? item.priceAmount : NaN, "min"));
  }
  if (settings.bestRated) {
    award("best_rated", winners(items, (item) => finite(item.rating) && item.rating >= 0 && item.rating <= 5 ? item.rating : NaN));
  }
  const popularityValue = (item) => {
    const value = popularity[item.id];
    return Number.isInteger(value) && value >= 0 ? value : NaN;
  };
  const popularityScores = normalizedMetric(items, popularityValue);
  if (settings.mostPopular && popularityScores) {
    award("most_popular", winners(items, (item) => popularityScores.get(item.key)));
  }

  if (settings.bestValue) {
    const priceScores = normalizedMetric(items, (item) => finite(item.priceAmount) && item.priceAmount >= 0 ? item.priceAmount : NaN, true);
    const ratingScores = normalizedMetric(items, (item) => finite(item.rating) && item.rating >= 0 && item.rating <= 5 ? item.rating : NaN);
    const metrics = [priceScores, ratingScores, popularityScores].filter(Boolean);
    // Equal-weight mean of the available normalized metrics. Requiring at least
    // two informative dimensions prevents Best Value from duplicating Lowest Price.
    if (metrics.length >= 2) {
      award("best_value", winners(items, (item) => metrics.reduce((sum, metric) => sum + metric.get(item.key), 0) / metrics.length));
    }
  }

  const limit = Number.isInteger(settings.maxPerProduct) ? Math.min(4, Math.max(1, settings.maxPerProduct)) : 2;
  for (const item of items) {
    result[item.key] = BADGE_PRIORITY.filter((badge) => result[item.key].includes(badge)).slice(0, limit);
  }
  return result;
}

export async function loadComparisonBadges(app) {
  const ids = [...new Set(app.items.map((item) => item.id))].slice(0, 10);
  if (ids.length < 2 || !app.dataset.smartBadgesEndpoint) return {};
  const endpoint = new URL(app.dataset.smartBadgesEndpoint, location.origin);
  if (endpoint.origin !== location.origin) return {};
  endpoint.searchParams.set("ids", ids.join(","));
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, credentials: "same-origin", signal: app.events.signal });
  if (!response.ok) return {};
  const payload = await response.json();
  app.smartBadgesEnabled = payload.settings?.enabled === true || payload.settings?.enabled === 1 || payload.settings?.enabled === "1" || payload.settings?.enabled === "true";
  app.badgeLabels = Object.fromEntries(Object.entries(BADGE_LABELS).map(([key, fallback]) => {
    const saved = payload.settings?.labels?.[key];
    return [key, typeof saved === "string" && saved.trim() && saved.trim().length <= 40 ? saved.trim() : fallback];
  }));
  return calculateComparisonBadges(app.items, payload.settings, payload.popularity);
}
export async function refreshComparisonBadges(app) {
  const signature = app.items.map((item) => `${item.key}:${item.priceAmount}:${item.rating ?? ""}`).join("|") + ":" + Math.floor(Date.now() / 60000);
  if (signature === app.badgeSignature) return;
  app.badgeSignature = signature;
  const request = (app.badgeRequest || 0) + 1;
  app.badgeRequest = request;
  const assignments = await loadComparisonBadges(app);
  if (request !== app.badgeRequest || !app.isConnected) return;
  app.badgeAssignments = assignments;
  if (app.dialog.open) app.renderList();
}
