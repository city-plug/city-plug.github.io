const params = new URLSearchParams(location.search);
const orderId = params.get("order");

let me = null;
let order = null;
let business = null;
let isBuyer = false;
let chatOpen = false;

async function startChat() {
  if (!orderId) {
    document.getElementById("chatStatus").textContent = "No order selected.";
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
}

function showHeader() {
  document.getElementById("chatTitle").textContent =
    isBuyer ? business.name : "Customer order";

  document.getElementById("chatStatus").textContent =
    chatOpen ? "Chat open" : "Chat closed";

  document.getElementById("chatForm").hidden = !chatOpen;
  document.getElementById("receivedBtn").hidden = !(chatOpen && isBuyer);
}

startChat();





