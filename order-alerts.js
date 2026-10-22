// order-alerts.js
// Shows business owners when orders or messages need their attention.
// Load it AFTER config.js (it uses "db"). Customers are not affected.
(() => {
  const ORDERS_PAGE = "owner-orders.html";
  const REFRESH_MS = 60000; // backup refresh every 60 seconds
  const BANNER_ID = "order-alert-banner";
  const LINK_ID = "order-alert-link";

  const BANNER_STYLE =
    "display:block;padding:12px 16px;background:#e53935;color:#fff;" +
    "text-align:center;font-weight:600;text-decoration:none;";
  const BADGE_STYLE =
    "display:inline-block;min-width:18px;margin-left:6px;padding:0 6px;" +
    "border-radius:999px;background:#e53935;color:#fff;font-size:12px;" +
    "line-height:18px;text-align:center;";

  const currentPage = () => window.location.pathname.split("/").pop();
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  // DEBUG (temporary): shows messages in a strip at the bottom of the screen.
  // Remove this function and every report(...) line once the alert works.
  function report(e) {
    const box = document.createElement("div");
    box.textContent = e && e.message ? "Order alert problem: " + e.message : String(e);
    box.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px;" +
      "background:#fff3cd;color:#000;font-size:13px;border-top:1px solid #999;";
    document.body.appendChild(box);
  }

  // ---------- Data ----------
  async function getOwnedBusinessIds(userId) {
    const { data, error } = await db
      .from("businesses")
      .select("id")
      .eq("owner_id", userId);
    if (error) throw error;
    return (data || []).map((b) => b.id);
  }

  // Paid orders the owner has not marked as shipped yet
  async function countOrdersToShip(businessIds) {
    const { count, error } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("business_id", businessIds)
      .eq("status", "paid")
      .is("shipped_at", null);
    if (error) throw error;
    return count || 0;
  }

  // Messages from customers that the owner has not seen yet
  async function countUnreadMessages(userId) {
    const { count, error } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .neq("sender_id", userId);
    if (error) throw error;
    return count || 0;
  }

  // ---------- Display ----------
  function renderNavLink(total) {
    const nav = document.getElementById("nav");
    if (!nav) return;

    let link = document.getElementById(LINK_ID);
    if (!link) {
      link = document.createElement("a");
      link.id = LINK_ID;
      link.href = ORDERS_PAGE;
      link.textContent = "Orders";
      nav.insertBefore(link, nav.querySelector("button")); // before Log out
    }

    const oldBadge = link.querySelector("span");
    if (oldBadge) oldBadge.remove();

    if (total > 0) {
      const badge = document.createElement("span");
      badge.textContent = total;
      badge.style.cssText = BADGE_STYLE;
      link.appendChild(badge);
    }
  }

  function renderBanner(orders, messages) {
    let banner = document.getElementById(BANNER_ID);
    const nothingToShow = orders + messages === 0 || currentPage() === ORDERS_PAGE;

    if (nothingToShow) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement("a");
      banner.id = BANNER_ID;
      banner.href = ORDERS_PAGE;
      banner.style.cssText = BANNER_STYLE;
      document.body.prepend(banner);
    }

    const parts = [];
    if (orders) parts.push(plural(orders, "order") + " to ship");
    if (messages) parts.push(plural(messages, "new message"));
    banner.textContent = "You have " + parts.join(" and ") + ". Tap to open.";
  }

  // ---------- Run ----------
  async function refresh(userId, businessIds) {
    const [orders, messages] = await Promise.all([
      countOrdersToShip(businessIds),
      countUnreadMessages(userId),
    ]);
    report("alerts: orders to ship = " + orders + ", unread messages = " + messages); // DEBUG
    renderNavLink(orders + messages);
    renderBanner(orders, messages);
  }

  async function start() {
    try {
      report("alerts: script is running"); // DEBUG

      const { data } = await db.auth.getSession();
      if (!data.session) {
        report("alerts: no login session found"); // DEBUG
        return;
      }

      const userId = data.session.user.id;
      const businessIds = await getOwnedBusinessIds(userId);
      report("alerts: businesses found = " + businessIds.length); // DEBUG
      if (businessIds.length === 0) return; // customers stop here

      const update = () => refresh(userId, businessIds).catch(report);
      await update();

      // Instant updates (needs Realtime switched on, see step 3)
      db.channel("owner-order-alerts")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, update)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, update)
        .subscribe();

      // Backups, so it still works without Realtime
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) update();
      });
      setInterval(update, REFRESH_MS);
    } catch (e) {
      report(e);
    }
  }

  start();
})();
