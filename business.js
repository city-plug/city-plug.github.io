// One page for every business: business.html?b=<business link name>
// (older links with ?id=<business id> still work).
// Customers see the business, its banner picture, rate it, view products and pay.
// The owner of THIS business also gets: their shareable link, banner picture,
// add products, delete products, and payout setup.
// Shared code that must load before this file:
//   business-link.js (links), business-banner.js (banner), return-to.js (come back after login).

const businessKey = BusinessLink.keyFromUrl();

const statusEl = document.getElementById("status");
const bizSection = document.getElementById("bizSection");
const starsBox = document.getElementById("stars");
const rateMsg = document.getElementById("rateMsg");
const ownerBox = document.getElementById("ownerBox");
const payoutBox = document.getElementById("payoutBox");
const productsBox = document.getElementById("products");
const productsStatus = document.getElementById("productsStatus");
const payBar = document.getElementById("payBar");
const payTotal = document.getElementById("payTotal");
const payBtn = document.getElementById("payBtn");
const payNote = document.getElementById("payNote");

let session = null;
let business = null;
let isOwner = false;
let myRating = 0;
let deliveryBox = null;
let cart = {};

init();

// ---------- Start ----------
async function init() {
  if (!businessKey) {
    window.location.href = "index.html";
    return;
  }

  const { data: s } = await db.auth.getSession();
  session = s.session;

  const { data, error } = await BusinessLink.applyKey(
    db
      .from("businesses")
      .select("id, owner_id, name, city, category, description, payments_enabled, address, verified, slug, banner_path"),
    businessKey
  ).maybeSingle();

  if (error || !data) {
    statusEl.textContent = "Business not found.";
    return;
  }

  business = data;
  isOwner = !!session && session.user.id === business.owner_id;

  showBusiness();
  BusinessBanner.show(business);
  BusinessLink.canonicalize(business.slug);
  showContact();
  loadRating();
  loadProducts();

  if (isOwner) {
    const ordersLink = document.createElement("a");
    ordersLink.className = "owner-link";
    ordersLink.href = "owner-orders.html";
    ordersLink.textContent = "View my orders →";
    ownerBox.before(ordersLink);
    BusinessLink.mountOwnerBox(ownerBox, business);
    BusinessBanner.mountOwnerBox(ownerBox, business);

    ownerBox.hidden = false;
    setupContactForm();
    setupProductForm();
    setupPayouts();
  } else {
    document.getElementById("msgLink").href = "chat.html?business=" + business.id;
    document.getElementById("msgWrap").hidden = false;

    setupBuying();
  }
}

// ---------- Business details ----------
function showBusiness() {
  document.title = business.name + " | City Plug";
  document.getElementById("bizName").textContent = business.name;
  if (business.verified) {
    const badge = document.createElement("span");
    badge.className = "vbadge";
    badge.textContent = "\u2713 Verified";
    document.getElementById("bizName").appendChild(badge);
  }

  document.getElementById("bizTag").textContent = business.city + " · " + business.category;
  document.getElementById("bizDesc").textContent = business.description || "";

  const back = document.getElementById("back");
  back.textContent = "← " + business.category + " in " + business.city;
  back.href = "city.html?city=" + encodeURIComponent(business.city) +
              "&category=" + encodeURIComponent(business.category);

  bizSection.hidden = false;
}

// ---------- Address and map link (shown to everyone) ----------
function showContact() {
  document.getElementById("bizAddress").textContent = business.address || "";
  const map = document.getElementById("bizMap");
  if (business.address) {
    map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(business.address + ", " + business.city);
    map.hidden = false;
  } else {
    map.hidden = true;
  }
}

// ---------- Ratings ----------
async function loadRating() {
  const { data } = await db
    .from("ratings")
    .select("stars, user_id")
    .eq("business_id", business.id);

  const list = data || [];
  const count = list.length;
  const average = count ? list.reduce((sum, r) => sum + r.stars, 0) / count : 0;

  document.getElementById("ratingSummary").textContent = count
    ? "★ " + average.toFixed(1) + " (" + count + (count === 1 ? " rating)" : " ratings)")
    : "No ratings yet";

  // Owners cannot rate their own business
  if (isOwner) {
    starsBox.innerHTML = "";
    rateMsg.textContent = "Customers rate your business here.";
    return;
  }

  const mine = session ? list.find((r) => r.user_id === session.user.id) : null;
  myRating = mine ? mine.stars : 0;
  drawStars();
}

function drawStars() {
  starsBox.innerHTML = "";

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("button");
    star.type = "button";
    star.textContent = "★";
    if (i <= myRating) star.className = "on";
    star.addEventListener("click", () => rate(i));
    starsBox.appendChild(star);
  }
}

async function rate(stars) {
  rateMsg.textContent = "";

  if (!session) {
    rateMsg.innerHTML = ReturnTo.promptHtml("to rate");
    return;
  }

  const { error } = await db.from("ratings").upsert(
    { business_id: business.id, user_id: session.user.id, stars: stars },
    { onConflict: "business_id,user_id" }
  );

  if (error) {
    rateMsg.textContent = error.message;
    return;
  }

  rateMsg.textContent = "Thanks for rating!";
  loadRating();
}

// ---------- Products ----------
async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("id, name, description, price, image_url")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) {
    productsStatus.textContent = "Could not load products: " + error.message;
    return;
  }

  productsBox.innerHTML = "";
  cart = {};
  updatePayBar();

  if (data.length === 0) {
    productsStatus.textContent = isOwner
      ? "No products yet. Add your first one above."
      : "No products yet.";
    return;
  }

  productsStatus.textContent = "";
  data.forEach((p) => productsBox.appendChild(makeCard(p)));
}

function makeCard(p) {
  const card = document.createElement("div");
  card.className = "product";

  if (p.image_url) {
    const img = document.createElement("img");
    img.className = "pimg";
    img.src = p.image_url;
    img.alt = p.name;
    card.appendChild(img);
  }

  const info = document.createElement("div");
  info.className = "pinfo";

  const name = document.createElement("h3");
  name.textContent = p.name;

  const desc = document.createElement("p");
  desc.textContent = p.description || "";

  const row = document.createElement("div");
  row.className = "prow";

  const price = document.createElement("span");
  price.className = "price";
  price.textContent = "₦" + Number(p.price).toLocaleString();

  row.appendChild(price);

  // Owners do not buy from themselves, so only customers get the stepper
  if (!isOwner) {
    const stepper = document.createElement("div");
    stepper.className = "stepper";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";

    const qty = document.createElement("span");
    qty.textContent = "0";

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";

    let count = 0;
    const change = (n) => {
      count = Math.max(0, Math.min(50, count + n));
      qty.textContent = count;

      if (count === 0) {
        delete cart[p.id];
      } else {
        cart[p.id] = { product: p, qty: count };
      }
      updatePayBar();
    };

    minus.addEventListener("click", () => change(-1));
    plus.addEventListener("click", () => change(1));

    stepper.append(minus, qty, plus);
    row.appendChild(stepper);
  }

  info.append(name, desc, row);
  card.appendChild(info);

  // Only the owner gets a delete button
  if (isOwner) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    let armed = false;
    del.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        del.textContent = "Tap again to delete";
        setTimeout(() => {
          armed = false;
          del.textContent = "Delete";
        }, 4000);
        return;
      }
      deleteProduct(p.id);
    });
    info.appendChild(del);
  }

  return card;
}

async function deleteProduct(id) {
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    alert(error.message);
    return;
  }
  loadProducts();
}

// ---------- Customer: basket and paying ----------
function setupBuying() {
  if (!business.payments_enabled) {
    payNote.textContent = "Online payment is not available for this business yet.";
    return;
  }

  deliveryBox = document.createElement("div");
  deliveryBox.className = "owner-box";
  deliveryBox.hidden = true;
  deliveryBox.innerHTML =
    "<h3>Delivery details</h3>" +
    '<p class="note">The business uses these to deliver your order.</p>' +
    '<label for="dPhone">Phone number</label>' +
    '<input id="dPhone" type="tel" placeholder="08012345678">' +
    '<label for="dAddress">Delivery address</label>' +
    '<textarea id="dAddress" rows="3" placeholder="House number, street, area, city"></textarea>' +
    '<label for="dNote">Note for the seller (optional)</label>' +
    '<input id="dNote" type="text" placeholder="e.g. call me when you arrive">';
  document.querySelector("main").appendChild(deliveryBox);

  const dPhone = document.getElementById("dPhone");
  const dAddress = document.getElementById("dAddress");
  const dNote = document.getElementById("dNote");

  try {
    dPhone.value = localStorage.getItem("cp_phone") || "";
    dAddress.value = localStorage.getItem("cp_address") || "";
  } catch (e) {}

  payBtn.addEventListener("click", async () => {
    payNote.textContent = "";

    const phone = dPhone.value.trim();
    const address = dAddress.value.trim();
    const note = dNote.value.trim();
    if (session && phone.replace(/[^0-9]/g, "").length < 10) {
      payNote.textContent = "Please enter a phone number the seller can call.";
      return;
    }
    if (session && address.length < 8) {
      payNote.textContent = "Please type a fuller delivery address: house number, street, area and city.";
      deliveryBox.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!session) {
      payNote.innerHTML = ReturnTo.promptHtml("to pay");
      return;
    }

    const items = Object.values(cart).map((c) => ({
      product_id: c.product.id,
      quantity: c.qty
    }));

    payBtn.disabled = true;
    payBtn.textContent = "Please wait...";

    try {
      const timeout = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error("This is taking too long. Check your network and try again."));
        }, 25000);
      });

      const result = await Promise.race([
        callPayments({
          action: "checkout",
          business_id: business.id,
          items: items,
          return_url: new URL("order-complete.html", window.location.href).href
        }),
        timeout
      ]);

      const { data: pending, error: findErr } = await db
        .from("orders")
        .select("id")
        .eq("buyer_id", session.user.id)
        .eq("business_id", business.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (findErr || !pending || pending.length === 0) {
        throw new Error("Could not save your delivery details. Please try again.");
      }
      const { error: saveErr } = await db
        .from("orders")
        .update({ delivery_phone: phone, delivery_address: address, delivery_note: note || null })
        .eq("id", pending[0].id);
      if (saveErr) {
        throw new Error("Could not save your delivery details: " + saveErr.message);
      }
      try {
        localStorage.setItem("cp_phone", phone);
        localStorage.setItem("cp_address", address);
      } catch (e) {}

      payNote.textContent = "";
      const link = document.createElement("a");
      link.href = result.authorization_url;
      link.textContent = "Tap here if Paystack does not open";
      payNote.appendChild(link);

      window.location.href = result.authorization_url;
    } catch (e) {
      payBtn.disabled = false;
      payBtn.textContent = "Pay now";
      payNote.textContent = e.message;
    }
  });
}

function updatePayBar() {
  const picked = Object.values(cart);
  const total = picked.reduce((sum, c) => sum + Number(c.product.price) * c.qty, 0);

  payTotal.textContent = "₦" + total.toLocaleString();
  payBar.hidden = isOwner || !business.payments_enabled || picked.length === 0;
  if (deliveryBox) deliveryBox.hidden = payBar.hidden;
}

// ---------- Owner: add a product ----------
function setupProductForm() {
  const form = document.getElementById("productForm");
  const msg = document.getElementById("pMsg");
  const btn = document.getElementById("pBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const file = document.getElementById("pImage").files[0];

    if (file && file.size > 3 * 1024 * 1024) {
      msg.textContent = "That picture is too big. Please use one under 3MB.";
      return;
    }

    const priceText = document.getElementById("pPrice").value.replace(/,/g, "").trim();
    const price = Number(priceText);

    if (priceText === "" || isNaN(price) || price < 0) {
      msg.textContent = "Please enter the price as a number, like 400000.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    let imageUrl = null;
    if (file) {
      const ext = file.name.split(".").pop();
      const path = session.user.id + "/" + Date.now() + "." + ext;

      const { error: uploadError } = await db.storage
        .from("product-images")
        .upload(path, file);

      if (uploadError) {
        btn.disabled = false;
        btn.textContent = "Add product";
        msg.textContent = "Picture upload failed: " + uploadError.message;
        return;
      }

      imageUrl = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await db.from("products").insert({
      business_id: business.id,
      name: document.getElementById("pName").value.trim(),
      description: document.getElementById("pDesc").value.trim(),
      price: price,
      image_url: imageUrl
    });

    btn.disabled = false;
    btn.textContent = "Add product";

    if (error) {
      msg.textContent = error.message;
      return;
    }

    form.reset();
    msg.textContent = "Product added.";
    loadProducts();
  });
}

// ---------- Owner: set up where the money is paid ----------
async function setupPayouts() {
  payoutBox.hidden = false;

  const payoutForm = document.getElementById("payoutForm");
  const payoutDone = document.getElementById("payoutDone");
  const bankSelect = document.getElementById("bankSelect");
  const accountNumber = document.getElementById("accountNumber");
  const accountName = document.getElementById("accountName");
  const payoutMsg = document.getElementById("payoutMsg");
  const payoutBtn = document.getElementById("payoutBtn");

  const { data: payout } = await db
    .from("business_payouts")
    .select("account_name, account_last4")
    .eq("business_id", business.id)
    .maybeSingle();

  if (payout) {
    payoutDone.hidden = false;
    payoutDone.textContent =
      "Payouts are set up: " + (payout.account_name || "Bank account") +
      " (ending " + payout.account_last4 + "). You can now receive payments.";
    payoutForm.hidden = true;
    return;
  }

  try {
    const result = await callPayments({ action: "banks" });
    bankSelect.innerHTML = '<option value="">Choose your bank</option>';
    result.banks.forEach((b) => {
      const option = document.createElement("option");
      option.value = b.code;
      option.textContent = b.name;
      bankSelect.appendChild(option);
    });
  } catch (e) {
    bankSelect.innerHTML = '<option value="">Could not load banks</option>';
    payoutMsg.textContent = e.message;
  }

  let resolvedName = "";

  async function checkAccount() {
    resolvedName = "";
    accountName.textContent = "";

    const number = accountNumber.value.trim();
    if (number.length !== 10 || !bankSelect.value) return;

    accountName.textContent = "Checking account...";
    try {
      const r = await callPayments({
        action: "resolve",
        bank_code: bankSelect.value,
        account_number: number
      });
      resolvedName = r.account_name;
      accountName.textContent = "Account name: " + resolvedName;
    } catch (e) {
      accountName.textContent = "Could not confirm the account name: " + e.message;
    }
  }

  bankSelect.addEventListener("change", checkAccount);
  accountNumber.addEventListener("input", checkAccount);

  payoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    payoutMsg.textContent = "";

    if (!resolvedName) {
      payoutMsg.textContent = "Wait for the account name to appear, and check it is yours, then save.";
      return;
    }

    payoutBtn.disabled = true;
    payoutBtn.textContent = "Saving...";

    try {
      await callPayments({
        action: "subaccount",
        bank_code: bankSelect.value,
        account_number: accountNumber.value.trim(),
        account_name: resolvedName
      });
      window.location.reload();
    } catch (err) {
      payoutBtn.disabled = false;
      payoutBtn.textContent = "Save payout account";
      payoutMsg.textContent = err.message;
    }
  });
}

// ---------- Owner: edit business address ----------
function setupContactForm() {
  const form = document.createElement("form");
  form.className = "owner-box";
  form.innerHTML =
    "<h3>Business address</h3>" +
    '<p class="note">Customers see this on your page.</p>' +
    '<label for="cAddress">Business address</label>' +
    '<textarea id="cAddress" rows="2" placeholder="Shop number, street, area, city"></textarea>' +
    '<button type="submit" id="cBtn">Save address</button>' +
    '<p class="small-msg" id="cMsg"></p>';
  ownerBox.parentNode.insertBefore(form, ownerBox);

  const f = (id) => document.getElementById(id);
  f("cAddress").value = business.address || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = f("cMsg");
    msg.textContent = "";

    const details = {
      address: f("cAddress").value.trim() || null
    };

    f("cBtn").disabled = true;
    const { error } = await db.from("businesses").update(details).eq("id", business.id);
    f("cBtn").disabled = false;

    if (error) {
      msg.textContent = error.message;
      return;
    }

    Object.assign(business, details);
    showContact();
    msg.textContent = "Saved. Customers can now see this.";
  });
}
