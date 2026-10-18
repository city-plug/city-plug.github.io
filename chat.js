const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");

const titleEl = document.getElementById("chatTitle");
const backEl = document.getElementById("chatBack");
const statusEl = document.getElementById("chatStatus");
const listEl = document.getElementById("messages");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const photoInput = document.getElementById("photoInput");
const errEl = document.getElementById("chatError");

const LINK_PATTERN = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|ng|io|co|me|ly|xyz|info|biz|app|link|site|online)\b|[a-z0-9._-]+@[a-z0-9.-]+)/i;

// A note and a button that this page adds for itself
const noteEl = document.createElement("p");
noteEl.className = "chat-status";
statusEl.after(noteEl);

const receivedBtn = document.createElement("button");
receivedBtn.type = "button";
receivedBtn.textContent = "I received my order";
receivedBtn.hidden = true;
receivedBtn.style.cssText = "margin:8px 16px;padding:10px 14px;border:0;border-radius:8px;background:#16a34a;color:#fff;font-size:15px";
noteEl.after(receivedBtn);

let me = null;
let conv = null;
let biz = null;
let isOwner = false;
let closed = false;
let listening = false;
const shown = new Map();

init();

async function init() {
  if (!orderId) {
    window.location.href = "index.html";
    return;
  }

  const { data: s } = await db.auth.getSession();
  if (!s.session) {
    window.location.href = "login.html";
    return;
  }
  me = s.session.user;

  const { data: c } = await db
    .from("conversations")
    .select("id, business_id, customer_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!c) {
    statusEl.textContent = "No chat found for this order. A chat opens once the order is paid.";
    return;
  }
  conv = c;

  const { data: b } = await db
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", c.business_id)
    .maybeSingle();

  if (!b) {
    statusEl.textContent = "Could not load this chat.";
    return;
  }
  biz = b;
  isOwner = b.owner_id === me.id;

  titleEl.textContent = isOwner ? "Order chat · Customer" : b.name;
  backEl.textContent = isOwner ? "← Orders" : "← Back";
  backEl.href = isOwner ? "owner-orders.html" : "business.html?id=" + b.id;

  await refreshClosed();
  statusEl.textContent = "";
  await loadMessages();
  listenLive();
}

// Is the trade still open? Open = order is paid and the customer has not confirmed receipt
async function refreshClosed() {
  const { data } = await db
    .from("orders")
    .select("status, received_at")
    .eq("id", orderId)
    .maybeSingle();

  closed = !data || data.status !== "paid" || !!data.received_at;
  form.hidden = closed;
  receivedBtn.hidden = closed || isOwner;
  noteEl.textContent = closed
    ? "This chat is closed because the order is complete. You can still read the messages."
    : "";
}

// Two taps to confirm (pop-up boxes can be blocked on phones)
let armed = false;
receivedBtn.addEventListener("click", async () => {
  if (!armed) {
    armed = true;
    receivedBtn.textContent = "Tap again to confirm. This closes the chat.";
    setTimeout(() => {
      armed = false;
      receivedBtn.textContent = "I received my order";
    }, 4000);
    return;
  }
  armed = false;
  receivedBtn.disabled = true;
  const { error } = await db.rpc("confirm_received", { p_order_id: orderId });
  receivedBtn.disabled = false;
  receivedBtn.textContent = "I received my order";
  if (error) {
    showError(error.message);
    return;
  }
  await refreshClosed();
});

async function loadMessages() {
  const { data, error } = await db
    .from("messages")
    .select("id, sender_id, body, image_path, created_at, read_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  if (error) {
    statusEl.textContent = "Could not load messages: " + error.message;
    return;
  }

  listEl.innerHTML = "";
  shown.clear();
  for (const m of data) await addMessage(m);
  scrollDown();
  markRead();
}

async function addMessage(m) {
  if (shown.has(m.id)) return;
  const entry = { tick: null };
  shown.set(m.id, entry);

  const mine = m.sender_id === me.id;
  const row = document.createElement("div");
  row.className = "msg " + (mine ? "mine" : "theirs");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (m.image_path) {
    const { data } = await db.storage.from("chat-images").createSignedUrl(m.image_path, 3600);
    if (data && data.signedUrl) {
      const img = document.createElement("img");
      img.src = data.signedUrl;
      img.alt = "Picture";
      bubble.appendChild(img);
    } else {
      bubble.textContent = "[Picture unavailable]";
    }
  }

  if (m.body) {
    const text = document.createElement("div");
    text.textContent = m.body;
    bubble.appendChild(text);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.textContent = time + " ";
  if (mine) {
    const tick = document.createElement("span");
    tick.textContent = m.read_at ? "✓✓ Seen" : "✓ Sent";
    meta.appendChild(tick);
    entry.tick = tick;
  }
  bubble.appendChild(meta);

  row.appendChild(bubble);
  listEl.appendChild(row);
}

function scrollDown() {
  listEl.scrollTop = listEl.scrollHeight;
}

function showError(text) {
  errEl.textContent = text || "";
}

// If the database refuses because the chat just closed, say so nicely
async function handleSendError(error) {
  if (error.message && error.message.toLowerCase().includes("row-level security")) {
    await refreshClosed();
    showError("This chat is closed.");
  } else {
    showError(error.message);
  }
}

async function markRead() {
  await db
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conv.id)
    .neq("sender_id", me.id)
    .is("read_at", null);
}

function listenLive() {
  if (listening) return;
  listening = true;

  db.channel("chat-" + conv.id)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + conv.id },
      async (payload) => {
        await addMessage(payload.new);
        scrollDown();
        if (payload.new.sender_id !== me.id) markRead();
      })
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: "conversation_id=eq." + conv.id },
      (payload) => {
        const entry = shown.get(payload.new.id);
        if (entry && entry.tick && payload.new.read_at) entry.tick.textContent = "✓✓ Seen";
      })
    .subscribe();
}

// ---------- Send a text message ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  const text = input.value.trim();
  if (!text) return;

  if (LINK_PATTERN.test(text)) {
    showError("Links and email addresses are not allowed in chat.");
    return;
  }

  sendBtn.disabled = true;
  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conv.id, sender_id: me.id, body: text })
    .select("id, sender_id, body, image_path, created_at, read_at")
    .single();
  sendBtn.disabled = false;

  if (error) {
    await handleSendError(error);
    return;
  }

  input.value = "";
  await addMessage(data);
  scrollDown();
});

// ---------- Send a picture ----------
photoInput.addEventListener("change", async () => {
  showError("");
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;

  const types = ["image/jpeg", "image/png", "image/webp"];
  if (!types.includes(file.type)) {
    showError("Only JPG, PNG or WEBP pictures can be sent.");
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showError("That picture is too big. Please use one under 3MB.");
    return;
  }

  sendBtn.disabled = true;
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = conv.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;

  const { error: uploadError } = await db.storage.from("chat-images").upload(path, file);
  if (uploadError) {
    sendBtn.disabled = false;
    await handleSendError(uploadError);
    return;
  }

  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conv.id, sender_id: me.id, image_path: path })
    .select("id, sender_id, body, image_path, created_at, read_at")
    .single();
  sendBtn.disabled = false;

  if (error) {
    await handleSendError(error);
    return;
  }

  await addMessage(data);
  scrollDown();
});


