// Admin only: see every complaint, reply inside the thread, mark resolved.
// Real protection comes from the database rules (is_admin). This page
// also checks and sends everyone else away.

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const filterBtns = document.querySelectorAll(".filters button");

const threadBox = document.getElementById("thread");
const backBtn = document.getElementById("back");
const tTitle = document.getElementById("tTitle");
const tSub = document.getElementById("tSub");
const toggleBtn = document.getElementById("toggle");
const msgsEl = document.getElementById("msgs");
const errEl = document.getElementById("err");
const form = document.getElementById("form");
const textEl = document.getElementById("text");
const sendBtn = document.getElementById("send");

let session = null;
let complaints = [];
let businessNames = {};
let orderRefs = {};
let filter = "all";

let current = null;
let timer = null;
let signature = "";

init();

// ---------- Start ----------
async function init() {
  const { data: s } = await db.auth.getSession();
  session = s.session;

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  // Ask the database whether this account is the admin
  const { data: isAdmin, error } = await db.rpc("is_admin");
  if (error || isAdmin !== true) {
    window.location.href = "index.html";
    return;
  }

  await loadComplaints();
}

// ---------- Helpers ----------
function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function orderLabel(c) {
  const ref = orderRefs[c.order_id] || c.order_id;
  return "Order #" + ref.toString().slice(-6).toUpperCase();
}

// ---------- Load the list ----------
async function loadComplaints() {
  const { data, error } = await db
    .from("complaints")
    .select("id, order_id, filed_by_role, city, business_id, message, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Could not load complaints: " + error.message;
    return;
  }

  complaints = data || [];

  if (complaints.length === 0) {
    listEl.innerHTML = "";
    statusEl.textContent = "No complaints yet.";
    return;
  }

  statusEl.textContent = "";

  const bizIds = [...new Set(complaints.map((c) => c.business_id).filter(Boolean))];
  if (bizIds.length) {
    const { data: biz } = await db.from("businesses").select("id, name").in("id", bizIds);
    businessNames = {};
    (biz || []).forEach((b) => { businessNames[b.id] = b.name; });
  }

  // Order numbers (matches what the customer sees). Skipped quietly if not allowed.
  const orderIds = [...new Set(complaints.map((c) => c.order_id))];
  const { data: ords, error: ordErr } = await db
    .from("orders")
    .select("id, reference")
    .in("id", orderIds);
  orderRefs = {};
  if (!ordErr) {
    (ords || []).forEach((o) => { orderRefs[o.id] = o.reference || o.id; });
  }

  renderList();
}

function renderList() {
  listEl.innerHTML = "";

  const shown = complaints.filter((c) => filter === "all" || c.status === filter);

  if (shown.length === 0) {
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = "Nothing in this view.";
    listEl.appendChild(p);
    return;
  }

  shown.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "top";
    const h = document.createElement("h2");
    h.textContent = businessNames[c.business_id] || "Business";
    const pill = document.createElement("span");
    pill.className = "pill " + c.status;
    pill.textContent = c.status === "resolved" ? "Resolved" : "Open";
    top.append(h, pill);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent =
      (c.city || "No city") + " · from " + c.filed_by_role + " · " + orderLabel(c) + " · " + when(c.created_at);

    const preview = document.createElement("p");
    preview.className = "preview";
    preview.textContent = c.message;

    card.append(top, meta, preview);
    card.addEventListener("click", () => openThread(c));
    listEl.appendChild(card);
  });
}

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.f;
    filterBtns.forEach((b) => b.classList.toggle("on", b === btn));
    renderList();
  });
});

// ---------- Thread ----------
function openThread(c) {
  current = c;
  signature = "";
  msgsEl.innerHTML = "";
  errEl.textContent = "";
  textEl.value = "";

  tTitle.textContent = businessNames[c.business_id] || "Business";
  tSub.textContent = (c.city || "No city") + " · " + c.filed_by_role + " · " + orderLabel(c);
  updateToggle();

  threadBox.classList.add("show");
  document.body.style.overflow = "hidden";

  refreshThread(true);
  timer = setInterval(() => refreshThread(false), 5000);
}

function closeThread() {
  clearInterval(timer);
  timer = null;
  current = null;
  threadBox.classList.remove("show");
  document.body.style.overflow = "";
  loadComplaints();
}

backBtn.addEventListener("click", closeThread);

function updateToggle() {
  toggleBtn.textContent = current.status === "resolved" ? "Reopen" : "Mark resolved";
}

toggleBtn.addEventListener("click", async () => {
  if (!current) return;
  const next = current.status === "resolved" ? "open" : "resolved";

  toggleBtn.disabled = true;
  const { error } = await db.from("complaints").update({ status: next }).eq("id", current.id);
  toggleBtn.disabled = false;

  if (error) {
    errEl.textContent = "Could not update status: " + error.message;
    return;
  }

  errEl.textContent = "";
  current.status = next;
  updateToggle();
});

async function refreshThread(first) {
  if (!current) return;
  const id = current.id;

  const { data, error } = await db
    .from("complaint_messages")
    .select("id, sender, message, created_at")
    .eq("complaint_id", id)
    .order("created_at", { ascending: true });

  if (!current || current.id !== id) return;

  if (error) {
    errEl.textContent = "Could not load replies: " + error.message;
    return;
  }
  errEl.textContent = "";

  const sig = data.map((m) => m.id).join("|");
  if (!first && sig === signature) return;
  signature = sig;

  drawThread(current, data, first);
}

function drawThread(c, replies, first) {
  const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
  const frag = document.createDocumentFragment();

  // Original complaint (from the customer or owner)
  const original = document.createElement("div");
  original.className = "msg them";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = c.filed_by_role === "owner" ? "Business owner" : "Customer";
  const body = document.createElement("span");
  body.textContent = c.message;
  const meta = document.createElement("small");
  meta.textContent = when(c.created_at);
  original.append(who, body, meta);
  frag.appendChild(original);

  replies.forEach((m) => {
    const fromAdmin = m.sender === "admin";
    const bubble = document.createElement("div");
    bubble.className = "msg " + (fromAdmin ? "me" : "them");

    if (!fromAdmin) {
      const w = document.createElement("span");
      w.className = "who";
      w.textContent = m.sender === "owner" ? "Business owner" : "Customer";
      bubble.appendChild(w);
    }

    const t = document.createElement("span");
    t.textContent = m.message;
    bubble.appendChild(t);

    const mt = document.createElement("small");
    mt.textContent = when(m.created_at);
    bubble.appendChild(mt);

    frag.appendChild(bubble);
  });

  msgsEl.innerHTML = "";
  msgsEl.appendChild(frag);

  if (first || nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
}

// ---------- Reply ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!current) return;

  errEl.textContent = "";
  const text = textEl.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  sendBtn.textContent = "...";

  const { error } = await db.from("complaint_messages").insert({
    complaint_id: current.id,
    sender: "admin",
    message: text
  });

  sendBtn.disabled = false;
  sendBtn.textContent = "Send";

  if (error) {
    errEl.textContent = "Could not send: " + error.message;
    return;
  }

  textEl.value = "";
  refreshThread(true);
});
