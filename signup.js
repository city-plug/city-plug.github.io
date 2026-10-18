// Step 1: grab the things on the page we need to work with
const form = document.getElementById("signup-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

// Step 2: run this when the person taps "Sign up"
form.addEventListener("submit", async (e) => {
  e.preventDefault(); // stops the page from reloading
  message.textContent = "";
  message.className = "";

  // Step 3: read what they typed
  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const role = document.getElementById("role").value; // "customer" or "owner"

  // Step 4: check the basics before bothering Supabase
  if (password.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirm) {
    message.textContent = "Passwords do not match.";
    return;
  }

  // Step 5: send it to Supabase
  button.disabled = true;
  button.textContent = "Creating account...";

  const { data, error } = await db.auth.signUp({
    email: email,
    password: password,
    options: { data: { full_name: fullName, role: role } }
  });

  button.disabled = false;
  button.textContent = "Sign up";

  // Step 6: Supabase answered. Branch on the result.
  if (error) {
    // The "else" from your sketch: stay here and show the problem
    message.textContent = error.message;
    return;
  }

  if (data.session) {
    // Signed up and logged in. Where to next depends on who they are.
    if (role === "owner") {
      window.location.href = "create-business.html";
    } else {
      window.location.href = "index.html"; // customers go browse
    }
  } else {
    // Email confirmation is switched on in Supabase
    message.className = "ok";
    message.textContent = "Account created. Check your email to confirm, then log in.";
  }
});
