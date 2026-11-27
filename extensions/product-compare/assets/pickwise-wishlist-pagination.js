(() => {
  window.PickwiseWishlistPagination = (page, pageCount, onChange) => {
    const nav = document.createElement("nav"); nav.className = "pickwise-wishlist-pagination"; nav.setAttribute("aria-label", "Wishlist pages");
    const previous = document.createElement("button"); previous.type = "button"; previous.className = "pickwise-wishlist-button"; previous.textContent = "Previous"; previous.disabled = page === 1; previous.addEventListener("click", () => onChange(page - 1));
    const status = document.createElement("span"); status.setAttribute("aria-live", "polite"); status.textContent = `Page ${page} of ${pageCount}`;
    const next = document.createElement("button"); next.type = "button"; next.className = "pickwise-wishlist-button"; next.textContent = "Next"; next.disabled = page === pageCount; next.addEventListener("click", () => onChange(page + 1));
    nav.append(previous, status, next); return nav;
  };
})();
