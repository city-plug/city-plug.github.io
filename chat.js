window.onerror = function (msg, src, line) {
  document.getElementById("chatStatus").textContent =
    "Error: " + msg + " (line " + line + ")";
};

const params = new URLSearchParams(location.search);
const orderId = params.get("order");

let me = null;
let order = null;
let business = null;
let isBuyer = false;
let chatOpen = false;

async function startChat() {
  if (!orderId) {
    location.href = "index.html";
    return;
  }

  const { data: userData } = await db.auth.getUser();
  if (!userData.user) {
    location.href = "login.html";
    return;
  }
  me = userData.user;

  const { data: o, error } = await db
    .from("orders")
    .select("id, status, received_at, buyer_id, business_id")
    .eq("id", orderId)
    .single();

  if (error || !o) {
    document.getElementById("chatStatus").textContent = "Order not found.";
    return;
  }
  order = o;

  const { data: b } = await db
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", order.business_id)
    .single();
  business = b;

  isBuyer = order.buyer_id === me.id;
  const isOwner = business && business.owner_id === me.id;

  if (!isBuyer && !isOwner) {
    document.getElementById("chatStatus").textContent = "You can't open this chat.";
    return;
  }

  chatOpen = order.status === "paid" && !order.received_at;
  showHeader();
  await loadMessages();
  listenForMessages();
}

function showHeader() {
  document.getElementById("chatTitle").textContent =
    isBuyer ? business.name : "Customer order";

  document.getElementById("chatStatus").textContent =
    chatOpen ? "Chat open" : "Chat closed";

  document.getElementById("chatForm").hidden = !chatOpen;
  document.getElementById("receivedBtn").hidden = !(chatOpen && isBuyer);
}

async function loadMessages() {
  const { data, error } = await db
    .from("messages")
    .select("id, sender_id, body, image_path, created_at, read_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    document.getElementById("chatStatus").textContent =
      "Couldn't load messages: " + error.message;
    return;
  }

  const box = document.getElementById("messages");
  box.innerHTML = "";
  data.forEach(addMessage);
  box.scrollTop = box.scrollHeight;

  const unread = data.some(m => m.sender_id !== me.id && !m.read_at);
  if (unread) {
    await db.from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .neq("sender_id", me.id)
      .is("read_at", null);
  }
}

function addMessage(m) {
  const mine = m.sender_id === me.id;
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "theirs");

  if (m.image_path) {
    const img = document.createElement("img");
    img.className = "chat-img";
    div.appendChild(img);
    db.storage.from("chat-images")
      .createSignedUrl(m.image_path, 3600)
      .then(({ data }) => { if (data) img.src = data.signedUrl; });
  }

  if (m.body) {
    const p = document.createElement("p");
    p.textContent = m.body;
    div.appendChild(p);
  }

  const meta = document.createElement("small");
  const time = new Date(m.created_at)
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.textContent = mine ? time + (m.read_at ? " ✓✓ Seen" : " ✓ Sent") : time;
  div.appendChild(meta);

  document.getElementById("messages").appendChild(div);
}

function listenForMessages() {
  db.channel("order-" + orderId)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "messages",
        filter: "order_id=eq." + orderId },
      () => loadMessages())
    .subscribe();
}

document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chatOpen) return;

  const input = document.getElementById("msgInput");
  const text = input.value.trim();
  if (!text) return;

  const { error } = await db.from("messages")
    .insert({ order_id: orderId, sender_id: me.id, body: text });

  if (error) {
    const msg = error.message || "";
    alert(msg.includes("no_links") || msg.includes("no_emails")
      ? "Links and email addresses aren't allowed."
      : "Couldn't send: " + msg);
    return;
  }
  input.value = "";
  loadMessages();
});

document.getElementById("picInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !chatOpen) return;

  const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = types[file.type];
  if (!ext) {
    alert("Only JPG, PNG or WebP pictures are allowed.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Picture is too big. Maximum is 5 MB.");
    return;
  }

  const path = orderId + "/" + Date.now() + "." + ext;
  const { error: upErr } = await db.storage
    .from("chat-images")
    .upload(path, file, { contentType: file.type });
  if (upErr) {
    alert("Couldn't upload: " + (upErr.message || upErr));
    return;
  }

  const { error } = await db.from("messages")
    .insert({ order_id: orderId, sender_id: me.id, image_path: path });
  if (error) {
    alert("Couldn't send the picture: " + error.message);
    return;
  }
  loadMessages();
});

document.getElementById("receivedBtn").addEventListener("click", async () => {
  if (!confirm("Confirm you received your order? The chat will close.")) return;

  const { error } = await db.rpc("mark_order_received", { p_order: orderId });
  if (error) {
    alert("Couldn't confirm: " + error.message);
    return;
  }
  chatOpen = false;
  order.received_at = new Date().toISOString();
  showHeader();
});

startChat().catch(function (err) {
  document.getElementById("chatStatus").textContent =
    "Error: " + (err.message || err);
});













