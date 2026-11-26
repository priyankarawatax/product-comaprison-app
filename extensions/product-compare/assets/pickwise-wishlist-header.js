(() => {
  const addHeaderLink = () => {
    const root = document.querySelector("[data-pickwise-wishlist]");
    if (!root) return;
    let link = document.querySelector("[data-pickwise-wishlist-nav]");
    const shopRoot = new URL(root.dataset.shopRoot || "/", location.href).pathname;
    const selectedUrl = root.dataset.pageUrl;
    const pageUrl = selectedUrl && new URL(selectedUrl, location.href).pathname !== shopRoot
      ? selectedUrl
      : `${shopRoot.replace(/\/$/, "")}/pages/wishlist`;
    const account = document.querySelector("header .header__icon--account, header a[href*='/account'], header a[href*='/cart']");
    const icons = document.querySelector("header .header__icons, .header__icons, header [data-header-icons], header .header-actions") || account?.parentElement;
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
      link.append(heart);
    }
    link.href = pageUrl;
    link.hidden = false;
    link.classList.add("header__icon", "link", "focus-inset", "pickwise-wishlist-header-link");
    link.setAttribute("aria-label", "Wishlist");
    link.title = "Wishlist";
    const targetSelector = ".header__icon--account, a[href*='/account'], summary.header__icon, #cart-icon-bubble, a[href*='/cart']";
    const target = [...icons.children].find((child) => child.matches(targetSelector) || child.querySelector(targetSelector));
    if (link.parentElement === icons && (!target || link.nextElementSibling === target)) return;
    icons.insertBefore(link, target || null);
    if (oldItem && !oldItem.contains(link) && !oldItem.children.length) oldItem.remove();
  };
  document.addEventListener("pickwise-wishlist:disabled", () => document.querySelectorAll("[data-pickwise-wishlist-nav]").forEach((link) => link.remove()));
  const observer = new MutationObserver(addHeaderLink);
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  addHeaderLink();
})();
