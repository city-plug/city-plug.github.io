// auth-landing.js
// If an email link (password reset, confirmation) lands on the wrong page,
// pass the person on to the right one, keeping the sign-in details in the address.
// Load it FIRST on the home page, before any other script.
(() => {
  const hash = window.location.hash || "";
  const query = window.location.search || "";
  const text = hash + query;

  if (/type=recovery/.test(text)) {
    window.location.replace("reset-password.html" + query + hash);
    return;
  }

  if (/type=(signup|invite|magiclink|email_change)/.test(text)) {
    window.location.replace("login.html" + query + hash);
  }
})();
