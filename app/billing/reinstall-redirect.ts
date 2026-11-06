export function billingSelectionRedirectUrl(requestUrl: string) {
  const url = new URL(requestUrl);
  url.pathname = "/app/billing";
  url.searchParams.set("reinstall", "1");
  return `${url.pathname}?${url.searchParams.toString()}`;
}
