// The owner's list of paid orders: who bought what, and what the business receives.

const statusEl = document.getElementById("status");
const summaryBox = document.getElementById("summary");
const ordersBox = document.getElementById("orders");

// Money is stored in kobo (100 kobo = 1 naira)
function naira(kobo) {
  return "₦" + (Number(kobo) / 100).toLocaleString();
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

  const { data: business } = await db
    .from("businesses")
    .select("id, name")
    .eq("owner_id", s.session.user.id)
    .maybeSingle();

  if (!business) {
    window.location.href = "create-business.html";
    return;
  }

  const back = document.getElementById("back");
  back.href = "business.html?id=" + business.id;
  back.textContent = "← " + business.name;

  // Only paid orders. Row security means you can only ever see your own business's orders.
  const { data: orders, error } = await db
    .from("orders")
    .select("reference, total_kobo, commission_kobo, paid_at, buyer_name, buyer_email, order_items(name, quantity, unit_price_kobo)")
    .eq("business_id", business.id)
    .eq("status", "paid")
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

    ordersBox.appendChild(card);
  });
})();
