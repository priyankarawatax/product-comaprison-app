(() => {
  window.PickwiseWishlistPagination = (page, pageCount, onChange) => {
    const nav = document.createElement("nav"); nav.className = "pickwise-wishlist-pagination"; nav.setAttribute("aria-label", "Wishlist pages");
    const addButton = (label, target, active = false) => { const button = document.createElement("button"); button.type = "button"; button.className = `pickwise-wishlist-page-number${active ? " is-active" : ""}`; button.textContent = label; button.setAttribute("aria-label", `Page ${target}`); if (active) button.setAttribute("aria-current", "page"); button.addEventListener("click", () => onChange(target)); nav.append(button); };
    if (page > 1) addButton("‹", page - 1);
    const numbers = page <= 3 ? [1, 2, 3, "…", pageCount] : [1, "…", page - 1, page, page + 1, "…", pageCount];
    let previous = 0;
    for (const value of numbers) { if (value === "…") { const dots = document.createElement("span"); dots.className = "pickwise-wishlist-page-dots"; dots.textContent = "…"; nav.append(dots); continue; } if (value <= pageCount && value !== previous) { addButton(String(value), value, value === page); previous = value; } }
    if (page < pageCount) addButton("›", page + 1);
    return nav;
  };
})();
