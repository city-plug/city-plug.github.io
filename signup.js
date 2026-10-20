const form = document.getElementById("signup-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "";

  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const role = document.getElementById("role").value;

  if (password.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirm) {
    message.textContent = "Passwords do not match.";
    return;
  }

  button.disabled = true;
  button.textContent = "Creating account...";

  const { data, error } = await db.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: fullName, role: role },
      emailRedirectTo: "https://city-plug.github.io/login.html"
    }
  });

  button.disabled = false;
  button.textContent = "Sign up";

  if (error) {
    message.textContent = error.message;
    return;
  }

  if (data.session) {
    if (role === "owner") {
      window.location.href = "create-business.html";
    } else {
      window.location.href = "index.html";
    }
  } else {
    message.className = "ok";
    message.textContent = "Account created. Check your email (and spam) to confirm, then log in.";
  }
});


