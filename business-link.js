// business-link.js
// Shared code for business links: read them, build them, and show them to the owner.
// Load it AFTER config.js and BEFORE business.js.
// The card's styles live in business-link.css.
const BusinessLink = (() => {
  const PAGE = "business.html";
  const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
  const COPIED_MS = 2000;

  const LINK_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  // ---------- Reading and building links ----------

  // Reads ?b=<link name> (new links) or ?id=<id> (older links) from the address bar
  function keyFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const slug = params.get("b");
    if (slug && SLUG_PATTERN.test(slug)) return { slug };

    const id = params.get("id");
    if (id) return { id };

    return null;
  }

  // Adds the right filter to a Supabase query
  function applyKey(query, key) {
    return key.slug ? query.eq("slug", key.slug) : query.eq("id", key.id);
  }

  // Full link, built from whatever address the site is on now,
  // so it keeps working after you move to your own domain
  function urlFor(slug) {
    const url = new URL(PAGE, window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("b", slug);
    return url.href;
  }

  // Shows the clean link in the address bar, even if an older link was used
  function canonicalize(slug) {
    if (!slug) return;
    try {
      window.history.replaceState(null, "", urlFor(slug));
    } catch (e) {}
  }

  // ---------- Small helpers ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(field);
      field.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {}
      field.remove();
      return ok;
    }
  }

  // Splits the link so the business part can be shown in bold
  function splitLink(link, slug) {
    const readable = link.replace(/^https?:\/\//, "");
    return readable.endsWith(slug)
      ? [readable.slice(0, readable.length - slug.length), slug]
      : [readable, ""];
  }

  // Briefly turns a button green with a new label
  function flash(button, label) {
    const original = button.textContent;
    button.textContent = label;
    button.classList.add("done");
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("done");
    }, COPIED_MS);
  }

  // ---------- The owner's link card ----------

  function mountOwnerBox(beforeEl, business) {
    if (!beforeEl || !business || !business.slug) return;

    const link = urlFor(business.slug);
    const canShare = typeof navigator.share === "function";

    // Heading
    const icon = el("span", "blink-icon");
    icon.innerHTML = LINK_ICON; // fixed icon, no user text involved

    const titles = el("div");
    titles.append(
      el("h3", "blink-title", "Your business link"),
      el("p", "blink-sub", "Customers who tap it land straight on your page.")
    );

    const head = el("div", "blink-head");
    head.append(icon, titles);

    // The link, shown as a tappable pill
    const [prefix, slug] = splitLink(link, business.slug);
    const pill = el("button", "blink-pill");
    pill.type = "button";
    pill.title = "Tap to copy";
    pill.append(el("span", "blink-muted", prefix), el("strong", "", slug));

    // Buttons
    const copyBtn = el("button", "blink-btn " + (canShare ? "secondary" : "primary"), "Copy link");
    copyBtn.type = "button";

    const actions = el("div", "blink-actions");
    if (canShare) {
      const shareBtn = el("button", "blink-btn primary", "Share");
      shareBtn.type = "button";
      shareBtn.addEventListener("click", async () => {
        try {
          await navigator.share({
            title: business.name,
            text: "Visit " + business.name + " on City Plug",
            url: link
          });
        } catch (e) {
          // the owner closed the share menu, nothing to do
        }
      });
      actions.append(shareBtn);
    }
    actions.append(copyBtn);

    const hint = el("p", "blink-hint", "Press and hold the link above to copy it.");
    hint.hidden = true;

    const copyAction = async () => {
      const ok = await copyText(link);
      if (ok) {
        hint.hidden = true;
        flash(copyBtn, "Copied \u2713");
      } else {
        hint.hidden = false;
      }
    };
    copyBtn.addEventListener("click", copyAction);
    pill.addEventListener("click", copyAction);

    const card = el("section", "blink");
    card.append(head, pill, actions, hint);
    beforeEl.before(card);
  }

  return { keyFromUrl, applyKey, urlFor, canonicalize, mountOwnerBox };
})();
