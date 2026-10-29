// signup.js
const form = document.getElementById("signup-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

// Live checklist under the password box (rules live in password-rules.js)
PasswordRules.attachChecklist(document.getElementById("password"));

// "I agree to the Terms" checkbox, placed above the Sign up button
TermsConsent.mount(button);

// If a buyer came from a business link, remember where to send them back
ReturnTo.stashFromQuery();

// Cloudflare Turnstile puts its result in a hidden field on the form
function turnstileToken() {
  const field = document.querySelector('[name="cf-turnstile-response"]');
  return field ? field.value : "";
}

// Turnstile tokens work only once, so ask for a fresh one after a failure
function resetTurnstile() {
  if (window.turnstile) window.turnstile.reset();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "";

  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const role = document.getElementById("role").value;
  const captchaToken = turnstileToken();

  if (!captchaToken) {
    message.textContent = "Please complete the security check first.";
    return;
  }

  const problem = PasswordRules.firstProblem(password);
  if (problem) {
    message.textContent = problem;
    return;
  }
  if (password !== confirm) {
    message.textContent = "Passwords do not match.";
    return;
  }
  if (!TermsConsent.isAccepted()) {
    message.textContent = "Please accept the Terms of use to create an account.";
    return;
  }

  button.disabled = true;
  button.textContent = "Creating account...";

  const { data, error } = await db.auth.signUp({
    email: email,
    password: password,
    options: {
      captchaToken: captchaToken,
      data: { full_name: fullName, role: role, ...TermsConsent.metadata() },
      emailRedirectTo: SiteUrl.page("login.html")
    }
  });

  button.disabled = false;
  button.textContent = "Sign up";

  if (error) {
    message.textContent = error.message;
    resetTurnstile();
    return;
  }

  if (data.session) {
    if (role === "owner") {
      ReturnTo.clear();
      window.location.href = "create-business.html";
    } else {
      window.location.href = ReturnTo.take() || "index.html";
    }
  } else {
    message.className = "ok";
    message.textContent = "Account created. Check your email (and spam) to confirm, then log in.";
  }
});
