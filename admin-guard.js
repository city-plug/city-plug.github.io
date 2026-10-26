// admin-guard.js
// Shared admin check. The real protection is in the database (is_admin());
// this only decides what the page shows. Load it AFTER config.js.
const AdminGuard = (() => {
  async function isAdmin() {
    const { data: s } = await db.auth.getSession();
    if (!s.session) return false;
    const { data, error } = await db.rpc("is_admin");
    return !error && data === true;
  }

  // For admin-only pages: send everyone else away
  async function ensure() {
    const { data: s } = await db.auth.getSession();
    if (!s.session) {
      window.location.replace("login.html");
      return false;
    }
    if (!(await isAdmin())) {
      window.location.replace("index.html");
      return false;
    }
    return true;
  }

  return { isAdmin, ensure };
})();
