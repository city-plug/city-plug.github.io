const params = new URLSearchParams(window.location.search);
const businessParam = params.get("business"); // customer opens a chat with a business
const convParam = params.get("c");            // owner opens an existing conversation

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

let me = null;
let conv = null;          // { id }
let businessInfo = null;  // { id, name, owner_id }
let isOwner = false;
let listening = false;
const shown = new Map();  // message id -> { tick }

init();

async function init() {
  const { data: s } = await db.auth.getSession();
  if (!s.session) {
    window.location.href = "login.html";
    return;
  }
  me = s.session.user;

  if (convParam) {
    const { data, error } = await db
      .from("conversations")
      .select("id, business_id, businesses(name, owner_id)")
      .eq("id", convParam)
      .maybeSingle();
    if (error || !data) {
      statusEl.textContent = "Conversation not found.";
      return;
    }
    conv = { id: data.id };
    businessInfo = { id: data.business_id, name: data.businesses.name, owner_id: data.businesses.owner_id };
  } else if (businessParam) {
    const { data, error } = await db
      .from("businesses")
      .select("id, name, owner_id")
      .eq("id", businessParam)
      .maybeSingle();
    if (error || !data) {
      statusEl.textContent = "Business not found.";
      return;
    }
    businessInfo = data;
    if (data.owner_id === me.id) {
      window.location.href = "inbox.html";
      return;
    }
    const { data: existing } = await db
      .from("conversations")
      .select("id")
      .eq("business_id", data.id)
      .eq("customer_id", me.id)
      .maybeSingle();
    if (existing) conv = existing;
  } else {
    window.location.href = "index.html";
    return;
  }

  isOwner = businessInfo.owner_id === me.id;
  titleEl.textContent = isOwner ? "Customer" : businessInfo.name;
  backEl.textContent = isOwner ? "← Inbox" : "← Back";
  backEl.href = isOwner ? "inbox.html" : "business.html?id=" + businessInfo.id;

  form.hidden = false;
  if (conv) {
    statusEl.textContent = "";
    await loadMessages();
    listenLive();
  } else {
    statusEl.textContent = "Say hello. Your message goes only to this business.";
  }
}

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

// Mark the other person's messages as read (this is what makes "Seen" appear for them)
async function markRead() {
  await db
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conv.id)
    .neq("sender_id", me.id)
    .is("read_at", null);
}

// New messages and "seen" updates arrive live, no refresh needed
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

// The conversation is created on the first message, so empty chats never pile up
async function ensureConversation() {
  if (conv) return true;

  const { data, error } = await db
    .from("conversations")
    .insert({ business_id: businessInfo.id, customer_id: me.id })
    .select("id")
    .single();

  if (error) {
    const { data: existing } = await db
      .from("conversations")
      .select("id")
      .eq("business_id", businessInfo.id)
      .eq("customer_id", me.id)
      .maybeSingle();
    if (!existing) {
      showError("Could not start the chat: " + error.message);
      return false;
    }
    conv = existing;
  } else {
    conv = data;
  }

  statusEl.textContent = "";
  listenLive();
  return true;
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
  if (!(await ensureConversation())) {
    sendBtn.disabled = false;
    return;
  }

  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conv.id, sender_id: me.id, body: text })
    .select("id, sender_id, body, image_path, created_at, read_at")
    .single();

  sendBtn.disabled = false;

  if (error) {
    showError(error.message);
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
  if (!(await ensureConversation())) {
    sendBtn.disabled = false;
    return;
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = conv.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;

  const { error: uploadError } = await db.storage.from("chat-images").upload(path, file);
  if (uploadError) {
    sendBtn.disabled = false;
    showError("Picture upload failed: " + uploadError.message);
    return;
  }

  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conv.id, sender_id: me.id, image_path: path })
    .select("id, sender_id, body, image_path, created_at, read_at")
    .single();

  sendBtn.disabled = false;

  if (error) {
    showError(error.message);
    return;
  }

  await addMessage(data);
  scrollDown();
});
