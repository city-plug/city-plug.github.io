// My orders: a logged-in customer sees the orders they have paid for,
// confirms delivery, and chats with the business about that order.

const CHAT_BUCKET = "chat-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const LINK_PATTERN = /(https?:|www\.|\.(com|net|org|ng|io|co|me|app|xyz|info|biz|link)\b)/i;

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const chatBox = document.getElementById("chat");
const chatTitle = document.getElementById("chatTitle");
const chatSub = document.getElementById("chatSub");
const chatClose = document.getElementById("chatClose");
const chatMsgs = document.getElementById("chatMsgs");
const chatNotice = document.getElementById("chatNotice");
const chatErr = document.getElementById("chatErr");
const chatForm = document.getElementById("chatForm");
const chatText = document.getElementById("chatText");
const chatPhoto = document.getElementById("chatPhoto");
const chatSend = document.getElementById("chatSend");
const photoName = document.getElementById("photoName");

let session = null;
let orders = [];
let businessNames = {};
let unreadByOrder = {};

let chatOrder = null;
let chatIsOpen = false;
let chatTimer = null;
let lastSignature = "";
const signedUrls = {};

init();

// ---------- Start ----------
async function init() {
  const { data: s } = await db.auth.getSession();
  session = s.session;

  // Registered customers only
  if (!session) {
    window.location.href = "login.html";
    return;
  }

  await loadOrders();
}

// ---------- Helpers ----------
function money(kobo) {
  return "₦" + (Number(kobo || 0) / 100).toLocaleString();
}

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function stageOf(o) {
  if (o.status === "cancelled" || o.status === "refunded") return "cancelled";
  if (o.received_at) return "received";
  if (o.shipped_at) return "shipped";
  return "paid";
}

function chatOpenFor(o) {
  const stage = stageOf(o);
  return stage === "paid" || stage === "shipped";
}

// ---------- Load orders ----------
async function loadOrders() {
  const { data, error } = await db
    .from("orders")
    .select("id, reference, business_id, total_kobo, status, created_at, paid_at, shipped_at, received_at")
    .eq("buyer_id", session.user.id)
    .not("paid_at", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Could not load your orders: " + error.message;
    return;
  }

  orders = data || [];

  if (orders.length === 0) {
    listEl.innerHTML = "";
    statusEl.textContent = "No orders yet. When you buy something, it will show up here.";
    return;
  }

  statusEl.textContent = "";

  // Business names
  const bizIds = [...new Set(orders.map((o) => o.business_id))];
  const { data: biz } = await db.from("businesses").select("id, name").in("id", bizIds);
  businessNames = {};
  (biz || []).forEach((b) => { businessNames[b.id] = b.name; });

  // Unread message counts (messages from the business that this customer has not read)
  unreadByOrder = {};
  const { data: unread } = await db
    .from("messages")
    .select("order_id")
    .in("order_id", orders.map((o) => o.id))
    .is("read_at", null)
    .neq("sender_id", session.user.id);
  (unread || []).forEach((m) => {
    unreadByOrder[m.order_id] = (unreadByOrder[m.order_id] || 0) + 1;
  });

  renderOrders();
}

// ---------- Draw the list ----------
function renderOrders() {
  listEl.innerHTML = "";
  orders.forEach((o) => listEl.appendChild(makeCard(o)));
}

function makeCard(o) {
  const stage = stageOf(o);
  const name = businessNames[o.business_id] || "Business";

  const card = document.createElement("div");
  card.className = "card";

  const top = document.createElement("div");
  top.className = "top";
  const title = document.createElement("h2");
  title.textContent = name;
  const pill = document.createElement("span");
  pill.className = "pill " + stage;
  pill.textContent = { paid: "Paid", shipped: "Shipped", received: "Received", cancelled: "Cancelled" }[stage];
  top.append(title, pill);

  const ref = (o.reference || o.id).toString().slice(-6).toUpperCase();
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = "Order #" + ref + " · " + money(o.total_kobo) + " · " + when(o.created_at);

  card.append(top, meta);

  if (stage !== "cancelled") {
    const steps = document.createElement("ol");
    steps.className = "steps";
    [
      ["Paid", o.paid_at],
      ["Shipped", o.shipped_at],
      ["Received", o.received_at]
    ].forEach(([label, time]) => {
      const li = document.createElement("li");
      if (time) li.className = "done";
      li.textContent = label;
      if (time) {
        const small = document.createElement("small");
        small.textContent = when(time);
        li.appendChild(small);
      }
      steps.appendChild(li);
    });
    card.appendChild(steps);
  }

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = {
    paid: "Waiting for the business to ship your order.",
    shipped: "Your order is on its way. Tap “I have received” once it arrives.",
    received: "Completed. Thank you!",
    cancelled: "This order was cancelled."
  }[stage];
  card.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "actions";

  const chatBtn = document.createElement("button");
  chatBtn.type = "button";
  chatBtn.className = "btn-chat";
  chatBtn.textContent = chatOpenFor(o) ? "Chat" : "View chat";
  const unread = unreadByOrder[o.id] || 0;
  if (unread > 0) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = unread;
    chatBtn.appendChild(badge);
  }
  chatBtn.addEventListener("click", () => openChat(o));
  actions.appendChild(chatBtn);

  if (stage === "shipped") {
    const receiveBtn = document.createElement("button");
    receiveBtn.type = "button";
    receiveBtn.className = "btn-receive";
    receiveBtn.textContent = "I have received";

    let armed = false;
    receiveBtn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        receiveBtn.classList.add("armed");
        receiveBtn.textContent = "Tap again to confirm";
        setTimeout(() => {
          armed = false;
          receiveBtn.classList.remove("armed");
          receiveBtn.textContent = "I have received";
        }, 4000);
        return;
      }

      receiveBtn.disabled = true;
      receiveBtn.textContent = "Please wait...";
      const { error } = await db.rpc("confirm_received", { p_order_id: o.id });
      if (error) {
        alert(error.message);
        receiveBtn.disabled = false;
        receiveBtn.textContent = "I have received";
        return;
      }
      loadOrders();
    });
    actions.appendChild(receiveBtn);
  }

  card.appendChild(actions);
  return card;
}

// ---------- Chat ----------
function openChat(o) {
  chatOrder = o;
  chatIsOpen = chatOpenFor(o);
  lastSignature = "";

  chatTitle.textContent = businessNames[o.business_id] || "Business";
  chatSub.textContent = "Order #" + (o.reference || o.id).toString().slice(-6).toUpperCase();
  chatMsgs.innerHTML = "";
  chatErr.textContent = "";
  clearPhoto();

  chatForm.style.display = chatIsOpen ? "flex" : "none";
  chatNotice.style.display = chatIsOpen ? "none" : "block";
  chatNotice.textContent = stageOf(o) === "cancelled"
    ? "This order was cancelled. The chat is read-only."
    : "This order is complete. The chat is now read-only.";

  chatBox.classList.add("show");
  document.body.style.overflow = "hidden";

  refreshChat(true);
  if (chatIsOpen) chatTimer = setInterval(() => refreshChat(false), 5000);
}

function closeChat() {
  clearInterval(chatTimer);
  chatTimer = null;
  chatOrder = null;
  chatBox.classList.remove("show");
  document.body.style.overflow = "";
  loadOrders();
}

chatClose.addEventListener("click", closeChat);

async function refreshChat(first) {
  if (!chatOrder) return;
  const orderId = chatOrder.id;

  const { data, error } = await db
    .from("messages")
    .select("id, sender_id, body, image_path, created_at, read_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (!chatOrder || chatOrder.id !== orderId) return;

  if (error) {
    chatErr.textContent = "Could not load messages: " + error.message;
    return;
  }
  chatErr.textContent = "";

  // Read receipts: mark the business's messages as read now that we have seen them
  const hasUnread = data.some((m) => m.sender_id !== session.user.id && !m.read_at);
  if (hasUnread) {
    await db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .neq("sender_id", session.user.id)
      .is("read_at", null);
  }

  // Only redraw when something changed
  const signature = data.map((m) => m.id + ":" + (m.read_at ? 1 : 0)).join("|");
  if (!first && signature === lastSignature) return;
  lastSignature = signature;

  await drawMessages(data, first);
}

async function imageUrl(path) {
  if (signedUrls[path]) return signedUrls[path];
  const { data } = await db.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
  if (data && data.signedUrl) signedUrls[path] = data.signedUrl;
  return signedUrls[path] || null;
}

async function drawMessages(list, first) {
  const nearBottom = chatMsgs.scrollHeight - chatMsgs.scrollTop - chatMsgs.clientHeight < 80;

  const frag = document.createDocumentFragment();

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = chatIsOpen
      ? "No messages yet. Say hello to the business."
      : "There are no messages for this order.";
    frag.appendChild(empty);
  }

  for (const m of list) {
    const mine = m.sender_id === session.user.id;
    const bubble = document.createElement("div");
    bubble.className = "msg " + (mine ? "me" : "them");

    if (m.image_path) {
      const url = await imageUrl(m.image_path);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Picture";
        bubble.appendChild(img);
      }
    }

    if (m.body) {
      const text = document.createElement("span");
      text.textContent = m.body;
      bubble.appendChild(text);
    }

    const meta = document.createElement("small");
    meta.textContent = when(m.created_at) + (mine ? (m.read_at ? " · Seen" : " · Sent") : "");
    bubble.appendChild(meta);

    frag.appendChild(bubble);
  }

  chatMsgs.innerHTML = "";
  chatMsgs.appendChild(frag);

  if (first || nearBottom) chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ---------- Sending ----------
function clearPhoto() {
  chatPhoto.value = "";
  photoName.style.display = "none";
  photoName.textContent = "";
}

chatPhoto.addEventListener("change", () => {
  const file = chatPhoto.files[0];
  if (file) {
    photoName.textContent = "Picture ready: " + file.name;
    photoName.style.display = "block";
  } else {
    clearPhoto();
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chatOrder || !chatIsOpen) return;

  chatErr.textContent = "";
  const text = chatText.value.trim();
  const file = chatPhoto.files[0];

  if (!text && !file) return;

  if (text.length > 1000) {
    chatErr.textContent = "That message is too long.";
    return;
  }
  if (LINK_PATTERN.test(text)) {
    chatErr.textContent = "Links are not allowed in chat.";
    return;
  }
  if (file && !file.type.startsWith("image/")) {
    chatErr.textContent = "Only pictures can be sent.";
    return;
  }
  if (file && file.size > MAX_IMAGE_BYTES) {
    chatErr.textContent = "That picture is too big. Please use one under 3MB.";
    return;
  }

  chatSend.disabled = true;
  chatSend.textContent = "...";

  let path = null;
  if (file) {
    const ext = ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[file.type] || "jpg";
    path = chatOrder.id + "/" + Date.now() + "." + ext;

    const { error: uploadError } = await db.storage.from(CHAT_BUCKET).upload(path, file);
    if (uploadError) {
      chatSend.disabled = false;
      chatSend.textContent = "Send";
      chatErr.textContent = "Picture upload failed: " + uploadError.message;
      return;
    }
  }

  const { error } = await db.from("messages").insert({
    order_id: chatOrder.id,
    sender_id: session.user.id,
    body: text,
    image_path: path
  });

  chatSend.disabled = false;
  chatSend.textContent = "Send";

  if (error) {
    chatErr.textContent = "Could not send: " + error.message;
    return;
  }

  chatText.value = "";
  clearPhoto();
  refreshChat(true);
});
