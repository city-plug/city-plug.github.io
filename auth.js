const message = document.getElementById("auth-message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (typeof supabase === "undefined") {
  message.textContent = "Login tool failed to load. Check your internet and reload.";
} else {
  message.textContent = "Ready";

  const sb = supabase.createClient(
    "https://ctqsufsamvayeccndmtm.supabase.co",
    "sb_publishable_FWGp8XdnG44eekvGBhFcOQ_zqhdgE7B"
  );

  document.getElementById("signup-btn").addEventListener("click", async function () {
    message.textContent = "Creating account...";
    const { error } = await sb.auth.signUp({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    message.textContent = error ? error.message : "Check your email and tap the confirmation link, then come back and log in.";
  });

  document.getElementById("login-btn").addEventListener("click", async function () {
    message.textContent = "Logging in...";
    const { error } = await sb.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) {
      message.textContent = error.message;
    } else {
      message.textContent = "Logged in! Redirecting...";
      window.location.href = "owner.html";
    }
  });
}
