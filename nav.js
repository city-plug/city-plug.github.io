// Top menu shared by index.html, city.html and business.html.
// Shows Log in / Sign up, or (My orders +) Log out, depending on who is here.
(async () => {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const { data } = await db.auth.getSession();

  if (data.session) {
    const logout = document.createElement("button");
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
      await db.auth.signOut();
      window.location.reload();
    });
    nav.appendChild(logout);

    addOrdersLink(nav, logout, data.session.user.id);
  } else {
    nav.innerHTML = '<a href="login.html">Log in</a><a href="signup.html">Sign up</a>';
  }
})();

// "My orders" link: only for logged-in customers (not business owners),
// and never on the home page.
async function addOrdersLink(nav, beforeEl, userId) {
  try {
    const page = window.location.pathname.split("/").pop();
    const isHome = page === "" || page === "index.html";
    if (isHome) return;

    // Business owners have their own orders page, so they do not get this link
    const { data: owned } = await db
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .limit(1);
    if (owned && owned.length > 0) return;

    const link = document.createElement("a");
    link.href = "orders.html";
    link.textContent = "My orders";
    nav.insertBefore(link, beforeEl);

    // Small red number when the business has replied and it is unread
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .neq("sender_id", userId);

    if (count && count > 0) {
      const badge = document.createElement("span");
      badge.textContent = count;
      badge.style.cssText =
        "display:inline-block;min-width:18px;margin-left:6px;padding:0 6px;" +
        "border-radius:999px;background:#e53935;color:#fff;font-size:12px;line-height:18px;text-align:center;";
      link.appendChild(badge);
    }
  } catch (e) {
    // The menu must never break the page, so ignore any problem here
  }
}

