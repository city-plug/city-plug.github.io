const form = document.getElementById("signup-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

// Live checklist under the password box (rules live in password-rules.js)
PasswordRules.attachChecklist(document.getElementById("password"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "";

  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const role = document.getElementById("role").value;

  // Grab the Turnstile token from the hidden response field Cloudflare creates
  const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]')?.value;
  
  if (!turnstileResponse) {
    message.textContent = "Please complete the security check (Turnstile).";
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

  button.disabled = true;
  button.textContent = "Creating account...";

  // NOTE: To securely validate your Secret Key (0x4AAAAAAFo48ISJywX7BC4ieao82h427ks), 
  // you ideally pass 'turnstileResponse' to a server-side function or Supabase Edge Function.
  // If you are calling supabase.auth.signUp directly from the client frontend, 
  // ensure your Supabase project's rate limits (which we looked at earlier) are tightly set.

  const { data, error } = await db.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: fullName, role: role, captcha_token: turnstileResponse },
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
