// admin-verifications.js
// Admin-only page: review shop verification requests, then approve or reject.
// Needs config.js, dom.js and admin-guard.js loaded before it.
(async () => {
  if (!(await AdminGuard.ensure())) return;

  const el = Dom.el;
  const list = document.getElementById("list");
  const status = document.getElementById("status");
  const PHOTO_LINK_SECONDS = 600;

  // Photos are private, so each one gets a temporary link
  async function signedUrl(path) {
    if (!path) return null;
    const { data } = await db.storage
      .from("verification-docs")
      .createSignedUrl(path, PHOTO_LINK_SECONDS);
    return data ? data.signedUrl : null;
  }

  function photoBlock(label, url) {
    const box = el("div", "vphoto");
    box.append(el("p", "ocard-sub", label));
    if (!url) {
      box.append(el("p", "ocard-hint", "Not provided"));
      return box;
    }
    const link = el("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    const img = el("img");
    img.src = url;
    img.alt = label;
    link.append(img);
    box.append(link);
    return box;
  }

  // Returns an error message, or "" when it worked
  async function saveDecision(request, approve) {
    if (approve) {
      const { data, error } = await db
        .from("businesses")
        .update({ verified: true })
        .eq("owner_id", request.owner_id)
        .select("id");
      if (error || !data || data.length === 0) {
        return "Could not verify the business: " + (error ? error.message : "not allowed");
      }
    }

    const { data, error } = await db
      .from("verification_requests")
      .update({ status: approve ? "approved" : "rejected" })
      .eq("owner_id", request.owner_id)
      .select("owner_id");
    if (error || !data || data.length === 0) {
      return "Could not save the decision: " + (error ? error.message : "not allowed");
    }
    return "";
  }

  async function decide(request, approve, note) {
    note.textContent = "Saving...";
    const problem = await saveDecision(request, approve);
    if (problem) {
      note.textContent = problem;
      return;
    }
    load();
  }

  async function makeCard(request, business) {
    const title = business ? business.name : "(business not found)";
    const sub = business ? business.city + " · " + business.category : request.owner_id;

    const titles = el("div");
    titles.append(el("h3", "ocard-title", title), el("p", "ocard-sub", sub));
    const head = el("div", "ocard-head");
    head.append(titles);

    const [shopUrl, idUrl] = await Promise.all([
      signedUrl(request.shop_photo_path),
      signedUrl(request.id_photo_path)
    ]);

    const approve = el("button", "ocard-btn primary", "Approve");
    const reject = el("button", "ocard-btn secondary", "Reject");
    approve.type = "button";
    reject.type = "button";

    const note = el("p", "ocard-hint");
    approve.addEventListener("click", () => {
      if (confirm("Verify " + title + "?")) decide(request, true, note);
    });
    reject.addEventListener("click", () => {
      if (confirm("Reject " + title + "?")) decide(request, false, note);
    });

    const actions = el("div", "ocard-actions");
    actions.append(approve, reject);

    const card = el("section", "ocard");
    card.append(head, photoBlock("Shop photo", shopUrl), photoBlock("ID photo", idUrl), actions, note);
    return card;
  }

  async function load() {
    status.textContent = "Loading...";
    list.innerHTML = "";

    const { data: requests, error } = await db
      .from("verification_requests")
      .select("owner_id, status, shop_photo_path, id_photo_path")
      .eq("status", "pending");

    if (error) {
      status.textContent = "Could not load requests: " + error.message;
      return;
    }
    if (!requests.length) {
      status.textContent = "No pending requests.";
      return;
    }

    const { data: businesses } = await db
      .from("businesses")
      .select("owner_id, name, city, category")
      .in("owner_id", requests.map((r) => r.owner_id));

    const byOwner = {};
    (businesses || []).forEach((b) => { byOwner[b.owner_id] = b; });

    status.textContent = requests.length + " pending";
    for (const request of requests) {
      list.appendChild(await makeCard(request, byOwner[request.owner_id]));
    }
  }

  load();
})();
