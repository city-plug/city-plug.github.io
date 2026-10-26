// admin-link.js
// Adds "Complaints" and "Verify" links to the top menu, for the admin only.
// Load it AFTER config.js, admin-guard.js and nav.js.
(async () => {
  const nav = document.getElementById("nav");
  if (!nav || !(await AdminGuard.isAdmin())) return;

  const logout = nav.querySelector("button");
  [
    ["Complaints", "admin-complaints.html"],
    ["Verify", "admin-verifications.html"]
  ].forEach(([label, href]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    nav.insertBefore(link, logout);
  });
})();
