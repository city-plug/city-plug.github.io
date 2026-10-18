const form = document.getElementById("business-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");
let currentUser = null;

// Fill the City and Category dropdowns from the lists in config.js
function fillSelect(id, items) {
  const select = document.getElementById(id);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}
fillSelect("city", CITIES);
fillSelect("category", CATEGORIES);

// Guard: who is allowed on this page?
(async () => {
  const { data } = await db.auth.getSession();

  // Not logged in: go to login
  if (!data.session) {
    window.location.href = "login.html";
    return;
  }
  currentUser = data.session.user;

  // Customers cannot create businesses: send them to browse
  if (currentUser.user_metadata.role !== "owner") {
    window.location.href = "index.html";
    return;
  }

  // Already has a business: go manage it instead of making a second one
  const { data: existing } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", currentUser.id)
    .maybeSingle();

  if (existing) {
    window.location.href = "my-business.html";
    return;
  }

  document.getElementById("who").textContent = "Logged in as " + currentUser.email;
})();

// Save the business to Supabase
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";

  if (!currentUser) return;

  button.disabled = true;
  button.textContent = "Saving...";

  const { error } = await db.from("businesses").insert({
    owner_id: currentUser.id,
    name: document.getElementById("name").value.trim(),
    city: document.getElementById("city").value,
    category: document.getElementById("category").value,
    description: document.getElementById("description").value.trim()
  });

  if (error) {
    button.disabled = false;
    button.textContent = "Create business page";
    message.textContent = error.message;
    return;
  }

  window.location.href = "my-business.html";
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  window.location.href = "login.html";
});
