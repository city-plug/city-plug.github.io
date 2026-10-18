const form = document.getElementById("login-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  button.disabled = true;
  button.textContent = "Logging in...";

  // Ask Supabase to check the email and password
  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    button.disabled = false;
    button.textContent = "Log in";
    message.textContent = error.message;
    return;
  }

  // Logged in. Does this person own a business?
  const { data: business } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", data.user.id)
    .maybeSingle();

  const role = data.user.user_metadata.role; // "customer" or "owner"

  if (business) {
    // Owner with a page: go manage it (my-business.html is still to be built)
    window.location.href = "my-business.html";
  } else if (role === "owner") {
    // Owner who hasn't created their page yet
    window.location.href = "create-business.html";
  } else {
    // Customer: browse everything. Rating and buying come later.
    window.location.href = "index.html";
  }
});
