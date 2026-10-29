// terms-consent.js
// The "I agree to the Terms of use" checkbox for the sign-up form.
// Acceptance is saved once, with the account, together with the version
// of the terms that was accepted. Change VERSION whenever terms.html changes.
// Load it BEFORE signup.js. Its styles are in terms-consent.css.
const TermsConsent = (() => {
  const VERSION = "2026-10-27";
  let box = null;

  function mount(beforeEl) {
    if (!beforeEl || box) return;

    box = document.createElement("input");
    box.type = "checkbox";
    box.id = "terms-accept";

    const text = document.createElement("span");
    text.append("I have read and agree to the ");

    const link = document.createElement("a");
    link.href = "terms.html";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Terms of use and Privacy notice";
    text.append(link, ".");

    const row = document.createElement("label");
    row.className = "terms-row";
    row.append(box, text);
    beforeEl.before(row);
  }

  const isAccepted = () => !!box && box.checked;

  // Saved with the new account
  const metadata = () => ({
    terms_version: VERSION,
    terms_accepted_at: new Date().toISOString()
  });

  return { mount, isAccepted, metadata };
})();
