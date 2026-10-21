// The owner's list of orders: who bought what, what the business receives,
// shipping, and a private chat with each customer.

const statusEl = document.getElementById("status");
const summaryBox = document.getElementById("summary");
const ordersBox = document.getElementById("orders");

const CHAT_BUCKET = "chat-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const LINK_PATTERN = /(https?:|www\.|\.(com|net|org|ng|io|co|me|app|xyz|info|biz|link)\b)/i;

let me = null;          // the logged-in owner's user id
let unreadByOrder = {}; // unread customer messages per order

// Money is stored in kobo (100 kobo = 1 naira)
function naira(kobo) {
  return "₦" + (Number(kobo) / 100).toLocaleString();
}

function whenText(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

// One row inside an order card: label on the left, value on the right
function makeRow(label, value, strong) {
  const row = document.createElement("div");
  row.className = "order-row";
  if (strong) row.className += " strong";

  const left = document.createElement("span");
  left.textContent = label;
  const right = document.createElement("span");
  right.textContent = value;

  row.append(left, right);
  return row;
}

(async () => {
  // Guard: only logged-in owners
  const { data: s } = await db.auth.getSession();
  if (!s.session) {
    window.location.href = "login.html";
    return;
  }
  me = s.session.user.id;

  const { data: business } = await db
    .from("businesses")
    .select("id, name")
    .eq("owner_id", me)
    .maybeSingle();

  if (!business) {
    window.location.href = "create-business.html";
    return;
  }

  const back = document.getElementById("back");
  back.href = "business.html?id=" + business.id;
  back.textContent = "← " + business.name;

  // Paid, shipped and received orders. Row security means you can only ever see your own business's orders.
  const { data: orders, error } = await db
    .from("orders")
    .select("id, status, shipped_at, received_at, reference, total_kobo, commission_kobo, paid_at, buyer_name, buyer_email, delivery_phone, delivery_address, delivery_note, order_items(name, quantity, unit_price_kobo)")
    .eq("business_id", business.id)
    .in("status", ["paid", "shipped", "received"])
    .order("paid_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Could not load orders: " + error.message;
    return;
  }

  if (orders.length === 0) {
    statusEl.textContent = "No paid orders yet. They will appear here as customers pay.";
    return;
  }

  statusEl.textContent = "";

  // Unread messages from customers
  const { data: unread } = await db
    .from("messages")
    .select("order_id")
    .in("order_id", orders.map((o) => o.id))
    .is("read_at", null)
    .neq("sender_id", me);
  (unread || []).forEach((m) => {
    unreadByOrder[m.order_id] = (unreadByOrder[m.order_id] || 0) + 1;
  });

  // Totals at the top
  let totalSales = 0;
  let totalReceive = 0;
  orders.forEach((o) => {
    totalSales += Number(o.total_kobo);
    totalReceive += Number(o.total_kobo) - Number(o.commission_kobo);
  });

  summaryBox.hidden = false;
  summaryBox.innerHTML = "";
  summaryBox.append(
    makeRow("Paid orders", String(orders.length), false),
    makeRow("Total sales", naira(totalSales), false),
    makeRow("You receive", naira(totalReceive), true)
  );

  // One card per order
  orders.forEach((o) => {
    const card = document.createElement("div");
    card.className = "order";

    const when = document.createElement("div");
    when.className = "tag";
    when.textContent = new Date(o.paid_at).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short"
    });

    const buyer = document.createElement("div");
    buyer.className = "order-buyer";
    buyer.textContent = (o.buyer_name || "Customer") + (o.buyer_email ? " · " + o.buyer_email : "");

    card.append(when, buyer);

    // Where the order is up to
    const state = document.createElement("div");
    state.style.cssText = "margin:0 0 10px;font-size:14px;font-weight:700;";
    if (o.status === "received") {
      state.textContent = "Received by the customer ✓";
      state.style.color = "#146c36";
    } else if (o.status === "shipped") {
      state.textContent = "Shipped " + whenText(o.shipped_at) + " · waiting for the customer to confirm";
      state.style.color = "#0b4a9e";
    } else {
      state.textContent = "Paid · ready to ship";
      state.style.color = "#8a5a00";
    }
    card.appendChild(state);

    // Where and how to deliver
    if (o.delivery_phone || o.delivery_address) {
      const del = document.createElement("div");
      del.style.margin = "0 0 10px";
      del.style.padding = "10px";
      del.style.background = "#f4f5f7";
      del.style.borderRadius = "8px";
      del.style.fontSize = "14px";
      del.style.whiteSpace = "pre-line";
      let text = "Deliver to:\n" + (o.delivery_address || "");
      if (o.delivery_phone) text += "\nPhone: " + o.delivery_phone;
      if (o.delivery_note) text += "\nNote: " + o.delivery_note;
      del.textContent = text;
      card.appendChild(del);
    }

    // What they bought
    (o.order_items || []).forEach((item) => {
      card.appendChild(
        makeRow(
          item.quantity + " × " + item.name,
          naira(item.unit_price_kobo * item.quantity),
          false
        )
      );
    });

    // The money split
    const divider = document.createElement("hr");
    card.appendChild(divider);
    card.append(
      makeRow("Customer paid", naira(o.total_kobo), false),
      makeRow("City Plug commission (12%)", "− " + naira(o.commission_kobo), false),
      makeRow("You receive", naira(Number(o.total_kobo) - Number(o.commission_kobo)), true)
    );

    const ref = document.createElement("div");
    ref.className = "order-ref";
    ref.textContent = "Ref: " + o.reference;
    card.appendChild(ref);

    // Buttons: ship + chat
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;margin-top:12px;";

    const chatBtn = document.createElement("button");
    chatBtn.type = "button";
    chatBtn.textContent = o.status === "received" ? "View chat" : "Chat with customer";
    chatBtn.style.cssText = "flex:1;padding:12px;border:0;border-radius:10px;background:#1c1c1c;color:#fff;font:inherit;font-weight:700;cursor:pointer;";
    const unreadCount = unreadByOrder[o.id] || 0;
    if (unreadCount > 0) {
      const badge = document.createElement("span");
      badge.textContent = unreadCount;
      badge.style.cssText = "display:inline-block;min-width:20px;margin-left:6px;padding:1px 6px;border-radius:999px;background:#e53935;color:#fff;font-size:12px;";
      chatBtn.appendChild(badge);
    }
    chatBtn.addEventListener("click", () => openChat(o));
    actions.appendChild(chatBtn);

    if (o.status === "paid") {
      const shipBtn = document.createElement("button");
      shipBtn.type = "button";
      shipBtn.textContent = "I have shipped";
      shipBtn.style.cssText = "flex:1;padding:12px;border:0;border-radius:10px;background:#1f9d55;color:#fff;font:inherit;font-weight:700;cursor:pointer;";

      let armed = false;
      shipBtn.addEventListener("click", async () => {
        if (!armed) {
          armed = true;
          shipBtn.style.background = "#c47a00";
          shipBtn.textContent = "Tap again to confirm";
          setTimeout(() => {
            armed = false;
            shipBtn.style.background = "#1f9d55";
            shipBtn.textContent = "I have shipped";
          }, 4000);
          return;
        }

        shipBtn.disabled = true;
        shipBtn.textContent = "Please wait...";
        const { error: shipError } = await db.rpc("ship_order", { p_order_id: o.id });
        if (shipError) {
          alert(shipError.message);
          shipBtn.disabled = false;
          shipBtn.textContent = "I have shipped";
          return;
        }
        window.location.reload();
      });
      actions.appendChild(shipBtn);
    }

    card.appendChild(actions);
    ordersBox.appendChild(card);
  });
})();

// ============================================================
// Chat with the customer (full screen, built here so no HTML change is needed)
// ============================================================
let chatBox, chatTitle, chatSub, chatMsgs, chatNotice, chatErr, chatForm, chatText, chatPhoto, chatSend, photoName;
let chatOrder = null;
let chatIsOpen = false;
let chatTimer = null;
let lastSignature = "";
const signedUrls = {};

function buildChat() {
  if (chatBox) return;

  const style = document.createElement("style");
  style.textContent =
    "#ochat{position:fixed;inset:0;background:#f6f6f4;display:none;flex-direction:column;z-index:50;height:100dvh;font-family:inherit}" +
    "#ochat.show{display:flex}" +
    ".oc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border-bottom:1px solid #e4e4e4}" +
    ".oc-head button{border:0;background:none;font-size:22px;cursor:pointer;padding:0 6px}" +
    ".oc-head strong{display:block;font-size:16px}.oc-head span{font-size:12px;color:#777}" +
    "#ocMsgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".oc-msg{max-width:80%;padding:8px 12px;border-radius:14px;font-size:15px;line-height:1.35;word-wrap:break-word;white-space:pre-wrap}" +
    ".oc-msg.me{align-self:flex-end;background:#1c1c1c;color:#fff;border-bottom-right-radius:4px}" +
    ".oc-msg.them{align-self:flex-start;background:#fff;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08)}" +
    ".oc-msg img{display:block;max-width:100%;border-radius:10px;margin-bottom:4px}" +
    ".oc-msg small{display:block;margin-top:2px;font-size:11px;opacity:.65;text-align:right}" +
    ".oc-empty{margin:auto;color:#888;font-size:14px;text-align:center}" +
    "#ocNotice{display:none;padding:10px 14px;background:#fff3d6;color:#6b4600;font-size:13px;text-align:center}" +
    "#ocErr{padding:0 14px;color:#b3261e;font-size:13px}" +
    "#ocPhotoName{display:none;padding:0 14px 6px;background:#fff;font-size:12px;color:#555}" +
    "#ocForm{display:flex;gap:8px;align-items:flex-end;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e4e4e4}" +
    "#ocText{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:10px;font:inherit;font-size:16px;max-height:110px}" +
    ".oc-icon{display:flex;align-items:center;justify-content:center;border:0;background:#eee;border-radius:12px;width:44px;height:44px;font-size:20px;cursor:pointer}" +
    "#ocSend{border:0;background:#1c1c1c;color:#fff;border-radius:12px;height:44px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}" +
    "#ocSend:disabled{opacity:.5}";
  document.head.appendChild(style);

  chatBox = document.createElement("section");
  chatBox.id = "ochat";
  chatBox.innerHTML =
    '<div class="oc-head"><button type="button" id="ocClose" aria-label="Close chat">&larr;</button>' +
    '<div><strong id="ocTitle"></strong><span id="ocSub"></span></div></div>' +
    '<div id="ocMsgs"></div>' +
    '<div id="ocNotice"></div>' +
    '<div id="ocErr"></div>' +
    '<div id="ocPhotoName"></div>' +
    '<form id="ocForm">' +
    '<label class="oc-icon" for="ocPhoto" title="Send a picture">&#128247;</label>' +
    '<input type="file" id="ocPhoto" accept="image/*" hidden>' +
    '<textarea id="ocText" rows="1" maxlength="1000" placeholder="Type a message (no links)"></textarea>' +
    '<button type="submit" id="ocSend">Send</button></form>';
  document.body.appendChild(chatBox);

  chatTitle = document.getElementById("ocTitle");
  chatSub = document.getElementById("ocSub");
  chatMsgs = document.getElementById("ocMsgs");
  chatNotice = document.getElementById("ocNotice");
  chatErr = document.getElementById("ocErr");
  chatForm = document.getElementById("ocForm");
  chatText = document.getElementById("ocText");
  chatPhoto = document.getElementById("ocPhoto");
  chatSend = document.getElementById("ocSend");
  photoName = document.getElementById("ocPhotoName");

  document.getElementById("ocClose").addEventListener("click", closeChat);

  chatPhoto.addEventListener("change", () => {
    const file = chatPhoto.files[0];
    if (file) {
      photoName.textContent = "Picture ready: " + file.name;
      photoName.style.display = "block";
    } else {
      clearPhoto();
    }
  });

  chatForm.addEventListener("submit", sendMessage);
}

function clearPhoto() {
  chatPhoto.value = "";
  photoName.style.display = "none";
  photoName.textContent = "";
}

function openChat(o) {
  buildChat();
  chatOrder = o;
  chatIsOpen = o.status === "paid" || o.status === "shipped";
  lastSignature = "";

  chatTitle.textContent = o.buyer_name || "Customer";
  chatSub.textContent = "Order #" + (o.reference || o.id).toString().slice(-6).toUpperCase();
  chatMsgs.innerHTML = "";
  chatErr.textContent = "";
  clearPhoto();

  chatForm.style.display = chatIsOpen ? "flex" : "none";
  chatNotice.style.display = chatIsOpen ? "none" : "block";
  chatNotice.textContent = "This order is complete. The chat is now read-only.";

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
  window.location.reload();
}

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

  // Read receipts: mark the customer's messages as read now that we have seen them
  if (data.some((m) => m.sender_id !== me && !m.read_at)) {
    await db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .neq("sender_id", me)
      .is("read_at", null);
  }

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
    empty.className = "oc-empty";
    empty.textContent = chatIsOpen
      ? "No messages yet. Say hello to your customer."
      : "There are no messages for this order.";
    frag.appendChild(empty);
  }

  for (const m of list) {
    const mine = m.sender_id === me;
    const bubble = document.createElement("div");
    bubble.className = "oc-msg " + (mine ? "me" : "them");

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
    meta.textContent = whenText(m.created_at) + (mine ? (m.read_at ? " · Seen" : " · Sent") : "");
    bubble.appendChild(meta);

    frag.appendChild(bubble);
  }

  chatMsgs.innerHTML = "";
  chatMsgs.appendChild(frag);

  if (first || nearBottom) chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

async function sendMessage(e) {
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
    sender_id: me,
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
}





