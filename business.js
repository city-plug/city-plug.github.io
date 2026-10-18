// One page for every business: business.html?id=<business id>
// Customers see the business, rate it, view products and pay.
// The owner of THIS business also gets: add products, delete products, and set up payouts.

const params = new URLSearchParams(window.location.search);
const businessId = params.get("id");

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

let session = null;   // the logged-in person (or null)
let business = null;  // this page's business
let isOwner = false;  // true only if the logged-in person owns this business
let myRating = 0;     // the stars this person already gave
let cart = {};        // what the customer has picked: product id -> { product, qty }

init();

// ---------- Start ----------
async function init() {
  if (!businessId) {
    window.location.href = "index.html";
    return;
  }

  const { data: s } = await db.auth.getSession();
  session = s.session;

  const { data, error } = await db
    .from("businesses")
    .select("id, owner_id, name, city, category, description, payments_enabled")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !data) {
    statusEl.textContent = "Business not found.";
    return;
  }

  business = data;
  isOwner = !!session && session.user.id === business.owner_id;

  showBusiness();
  loadRating();
  loadProducts();

  if (isOwner) {
    ownerBox.hidden = false;
    setupProductForm();
    setupPayouts();
  } else {
    setupBuying();
  }
}

// ---------- Business details ----------
function showBusiness() {
  document.title = business.name + " | City Plug";
  document.getElementById("bizName").textContent = business.name;
  document.getElementById("bizTag").textContent = business.city + " · " + business.category;
  document.getElementById("bizDesc").textContent = business.description || "";

  const back = document.getElementById("back");
  back.textContent = "← " + business.category + " in " + business.city;
  back.href = "city.html?city=" + encodeURIComponent(business.city) +
              "&category=" + encodeURIComponent(business.category);

  bizSection.hidden = false;
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

  // Did this person already rate? Show their stars filled in.
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

  // Visitors who are not logged in must log in first
  if (!session) {
    rateMsg.innerHTML = 'Log in to rate. <a href="login.html">Log in</a>';
    return;
  }

  // upsert = add the rating, or change it if this person rated before
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

// One product card, following your template:
// picture on the left, name, description, price, and a quantity stepper
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

      // Keep the basket up to date
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
    // Two taps to delete (pop-up boxes can be blocked on phones)
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

  payBtn.addEventListener("click", async () => {
    payNote.textContent = "";

    // Visitors who are not logged in must log in first
    if (!session) {
      payNote.innerHTML = 'Please <a href="login.html">log in</a> to pay.';
      return;
    }

    const items = Object.values(cart).map((c) => ({
      product_id: c.product.id,
      quantity: c.qty
    }));

    payBtn.disabled = true;
    payBtn.textContent = "Please wait...";

    try {
      // The server works out the price and the 12% split, then starts the payment
      const result = await callPayments({
        action: "checkout",
        business_id: business.id,
        items: items,
        return_url: new URL("order-complete.html", window.location.href).href
      });

      // Go to Paystack's secure payment page
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

    // Allow commas in the price, like 400,000
    const priceText = document.getElementById("pPrice").value.replace(/,/g, "").trim();
    const price = Number(priceText);

    if (priceText === "" || isNaN(price) || price < 0) {
      msg.textContent = "Please enter the price as a number, like 400000.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    // Step 1: upload the picture (if there is one)
    let imageUrl = null;
    if (file) {
      const ext = file.name.split(".").pop();
      // Each owner's pictures go in their own folder, named by their user id
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

    // Step 2: save the product with its picture link
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

  // Already set up? Then just show a summary.
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

  // Fill the bank list
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

  // Once the bank and the 10 digits are in, show whose account it is
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

    // Safety: the account name must have appeared, so you can check it is yours
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
