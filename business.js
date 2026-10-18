// One page for every business: business.html?id=<business id>
// Customers see the business, rate it, and view products.
// The owner of THIS business also gets the "Add a product" box and delete buttons.

const params = new URLSearchParams(window.location.search);
const businessId = params.get("id");

const statusEl = document.getElementById("status");
const bizSection = document.getElementById("bizSection");
const starsBox = document.getElementById("stars");
const rateMsg = document.getElementById("rateMsg");
const ownerBox = document.getElementById("ownerBox");
const productsBox = document.getElementById("products");
const productsStatus = document.getElementById("productsStatus");

let session = null;   // the logged-in person (or null)
let business = null;  // this page's business
let isOwner = false;  // true only if the logged-in person owns this business
let myRating = 0;     // the stars this person already gave

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
    .select("id, owner_id, name, city, category, description")
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

  // Quantity stepper. Buying comes in a later step, so this only counts for now.
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
  minus.addEventListener("click", () => {
    if (count > 0) count--;
    qty.textContent = count;
  });
  plus.addEventListener("click", () => {
    count++;
    qty.textContent = count;
  });

  stepper.append(minus, qty, plus);
  row.append(price, stepper);
  info.append(name, desc, row);
  card.appendChild(info);

  // Only the owner gets a delete button
  if (isOwner) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteProduct(p.id));
    info.appendChild(del);
  }

  return card;
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;

  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    alert(error.message);
    return;
  }
  loadProducts();
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