// Forgot password: asks Supabase to email a reset link.
// The link opens reset-password.html, where the new password is chosen.
// Needs site-url.js, which builds the link from the address the site is on now.

const COOLDOWN_SECONDS = 60;

const form = document.getElementById("forgot-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

// Locks the button for a minute so nobody can spam reset emails
function startCooldown() {
  let left = COOLDOWN_SECONDS;
  button.disabled = true;

  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(timer);
      button.disabled = false;
      button.textContent = "Send reset link";
      return;
    }
    button.textContent = "Send again in " + left + "s";
  }, 1000);

  button.textContent = "Send again in " + left + "s";
}

function isRateLimited(error) {
  return error.status === 429 || /rate limit/i.test(error.message || "");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "";

  const email = document.getElementById("email").value.trim();

  button.disabled = true;
  button.textContent = "Sending...";

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: SiteUrl.page("reset-password.html")
  });

  if (error && isRateLimited(error)) {
    message.textContent = "Too many requests. Please wait a few minutes and try again.";
    startCooldown();
    return;
  }

  if (error) {
    console.error(error);
    message.textContent = "Something went wrong. Please try again.";
    button.disabled = false;
    button.textContent = "Send reset link";
    return;
  }

  // Same message whether or not the email has an account, so strangers
  // cannot use this page to find out who is registered.
  message.className = "ok";
  message.textContent = "If an account exists for that email, a reset link is on its way. Check your inbox and spam.";
  startCooldown();
});
