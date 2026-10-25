// require-login.js
// Put this on any page that is only for logged-in people.
// Load it AFTER config.js.
(async () => {
  const { data } = await db.auth.getSession();
  if (!data.session) window.location.replace("login.html");
})();
