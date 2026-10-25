// verify-link.js
// Shows the business owner a "Get verified" card that opens the verification page.
// Hidden once the business is verified. Load it AFTER config.js and dom.js,
// and BEFORE business.js. The card styles come from owner-card.css.
const VerifyLink = (() => {
  const el = Dom.el;
  const PAGE = "verify.html";

  function mountOwnerBox(beforeEl, business) {
    if (!beforeEl || !business || business.verified) return;

    const titles = el("div");
    titles.append(
      el("h3", "ocard-title", "Get verified"),
      el("p", "ocard-sub", "Verified shops get a badge and more trust from buyers. It's optional.")
    );
    const head = el("div", "ocard-head");
    head.append(titles);

    const link = el("a", "ocard-btn primary as-link", "Start verification");
    link.href = PAGE;

    const actions = el("div", "ocard-actions");
    actions.append(link);

    const card = el("section", "ocard");
    card.append(head, actions);
    beforeEl.before(card);
  }

  return { mountOwnerBox };
})();
