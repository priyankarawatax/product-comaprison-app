(() => {
  let state;
  const addHeaderLink = () => {
    if (!state?.ready) return;
    let link = document.querySelector("[data-pickwise-wishlist-nav]");
    const shopRoot = new URL(state.root.dataset.shopRoot || "/", location.href).pathname;
    const selectedUrl = state.root.dataset.pageUrl;
    const pageUrl = selectedUrl && new URL(selectedUrl, location.href).pathname !== shopRoot
      ? selectedUrl
      : `${shopRoot.replace(/\/$/, "")}/pages/wishlist`;
    const account = document.querySelector("header .header__icon--account, header a[href*='/account'], header a[href*='/cart']");
    const icons = document.querySelector("header .header__icons, .header__icons") || account?.parentElement;
    if (!icons) return;

    const oldItem = link?.closest("li");
    if (!link) {
      link = document.createElement("a");
      link.dataset.pickwiseWishlistNav = "";
    }
    if (!link.classList.contains("pickwise-wishlist-header-link")) {
      link.replaceChildren();
      const heart = document.createElement("span");
      heart.className = "pickwise-wishlist-header-heart";
      heart.setAttribute("aria-hidden", "true");
      heart.textContent = "♡";
      const count = document.createElement("span");
      count.className = "pickwise-wishlist-header-count";
      count.dataset.pickwiseWishlistCount = "";
      count.textContent = "0";
      link.append(heart, count);
    }
    link.href = pageUrl;
    link.hidden = false;
    link.classList.add("header__icon", "link", "focus-inset", "pickwise-wishlist-header-link");
    link.setAttribute("aria-label", "Wishlist");
    link.title = "Wishlist";
    const target = icons.querySelector(".header__icon--account, a[href*='/account'], summary.header__icon, #cart-icon-bubble, a[href*='/cart']");
    icons.insertBefore(link, target || null);
    if (oldItem && !oldItem.contains(link) && !oldItem.children.length) oldItem.remove();
  };
  document.addEventListener("pickwise-wishlist:runtime-ready", (event) => { state = event.detail.state; addHeaderLink(); });
  document.addEventListener("pickwise-wishlist:refresh", () => {
    document.querySelectorAll("[data-pickwise-wishlist-count]").forEach((count) => { count.hidden = !state?.items.size; });
  });
  new MutationObserver(addHeaderLink).observe(document.documentElement, { childList: true, subtree: true });
})();
