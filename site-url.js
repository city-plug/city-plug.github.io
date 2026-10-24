// site-url.js
// Builds full links to pages on this site from the address it is running on now,
// so emails (confirm signup, reset password) always point to the right domain.
// Load it AFTER config.js on any page that sends an email link.
const SiteUrl = (() => {
  function page(name) {
    return new URL(name, window.location.href).href;
  }

  return { page };
})();
