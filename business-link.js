// business-link.js
// Shared code for business links: read them, build them, and show them to the owner.
// Load it AFTER config.js and BEFORE business.js.
const BusinessLink = (() => {
  const PAGE = "business.html";
  const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

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

  // The box only the owner sees, with the link and Copy / Share buttons
  function mountOwnerBox(beforeEl, business) {
    if (!beforeEl || !business || !business.slug) return;

    const link = urlFor(business.slug);

    const box = document.createElement("div");
    box.className = "owner-box";

    const title = document.createElement("h3");
    title.textContent = "Your business link";

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Share this link. Customers who tap it come straight to your page.";

    const field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = link;
    field.addEventListener("focus", () => field.select());

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:8px;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy link";
    copyBtn.style.flex = "1";

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.textContent = "Share";
    shareBtn.style.flex = "1";

    const msg = document.createElement("p");
    msg.className = "small-msg";

    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(link);
      msg.textContent = ok ? "Link copied." : "Press and hold the link above to copy it.";
    });

    shareBtn.addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: business.name, url: link });
        } catch (e) {
          // the owner closed the share menu, nothing to do
        }
      } else {
        const ok = await copyText(link);
        msg.textContent = ok ? "Link copied." : "Press and hold the link above to copy it.";
      }
    });

    row.append(copyBtn, shareBtn);
    box.append(title, note, field, row, msg);
    beforeEl.before(box);
  }

  return { keyFromUrl, applyKey, urlFor, canonicalize, mountOwnerBox };
})();
