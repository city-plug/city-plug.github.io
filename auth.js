const AUTH_URL = "https://ctqsufsamvayeccndmtm.supabase.co";
const AUTH_KEY = "sb_publishable_FWGp8XdnG44eekvGBhFcOQ_zqhdgE7B";
const sb = supabase.createClient(AUTH_URL, AUTH_KEY);

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("auth-message");

document.getElementById("signup-btn").addEventListener("click", async function () {
  message.textContent = "Creating account...";
  const { data, error } = await sb.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });
  if (error) {
    message.textContent = error.message;
  } else {
    message.textContent = "Check your email and tap the confirmation link, then come back and log in.";
  }
});

document.getElementById("login-btn").addEventListener("click", async function () {
  message.textContent = "Logging in...";
  const { data, error } = await sb.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });
  if (error) {
    message.textContent = error.message;
  } else {
    window.location.href = "owner.html";
  }
});
