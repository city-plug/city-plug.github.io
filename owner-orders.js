// The owner's list of orders: who bought what, what the business receives,
// shipping, a private chat with each customer, and a "Report an issue"
// complaint thread per order that never closes.

const statusEl = document.getElementById("status");
const summaryBox = document.getElementById("summary");
const ordersBox = document.getElementById("orders");

const CHAT_BUCKET = "chat-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const LINK_PATTERN = /(https?:|www\.|\.(com|net|org|ng|io|co|me|app|xyz|info|biz|link)\b)/i;

let me = null;          // the logged-in owner's user id
let unreadByOrder = {}; // unread customer messages per order

// Complaint state
let myBusinessId = null;
let myCity = null;
let complaintByOrder = {};

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

  myBusinessId = business.id;

  // The business city, used when filing a complaint. Kept separate so the page
  // still works even if your businesses table names this column differently.
  const { data: cityRow, error: cityError } = await db
    .from("businesses")
    .select("city")
    .eq("id", business.id)
    .maybeSingle();
  if (!cityError && cityRow) myCity = cityRow.city;

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

  // Which orders already have a complaint filed by this owner
  complaintByOrder = {};
  const { data: complaints } = await db
    .from("complaints")
    .select("id, order_id, message, status, created_at")
    .in("order_id", orders.map((o) => o.id))
    .eq("filed_by_user_id", me);
  (complaints || []).forEach((c) => { complaintByOrder[c.order_id] = c; });

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

    // Report an issue / View complaint (always available, whatever the order status)
    const hasComplaint = !!complaintByOrder[o.id];
    const reportBtn = document.createElement("button");
    reportBtn.type = "button";
    reportBtn.textContent = hasComplaint ? "View complaint" : "Report an issue";
    reportBtn.style.cssText =
      "display:block;width:100%;margin-top:8px;padding:10px;border:1px solid #d8d8d8;border-radius:10px;background:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:" +
      (hasComplaint ? "#0b4a9e" : "#9b1c1c") + ";";
    reportBtn.addEventListener("click", () => openComplaint(o));
    card.appendChild(reportBtn);

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
  if (chatIs






