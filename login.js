const form = document.getElementById("login-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");
const resendBtn = document.getElementById("resend-btn");

// If a buyer came from a business link, remember where to send them back
ReturnTo.stashFromQuery();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  resendBtn.style.display = "none";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  button.disabled = true;
  button.textContent = "Logging in...";

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    button.disabled = false;
    button.textContent = "Log in";
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
      message.textContent = "Please confirm your email first. Check your inbox and spam.";
      resendBtn.style.display = "block";
    } else {
      message.textContent = error.message;
    }
    return;
  }

  const { data: business } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", data.user.id)
    .maybeSingle();

  const role = data.user.user_metadata.role;
  const comingBack = ReturnTo.take();

  if (business) {
    window.location.href = "my-business.html";
  } else if (role === "owner") {
    window.location.href = "create-business.html";
  } else {
    window.location.href = comingBack || "index.html";
  }
});

resendBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  resendBtn.disabled = true;
  const { error } = await db.auth.resend({
    type: "signup",
    email: email,
    options: { emailRedirectTo: "https://city-plug.github.io/login.html" }
  });
  message.textContent = error ? error.message : "Confirmation email sent. Check your inbox.";
  setTimeout(() => { resendBtn.disabled = false; }, 30000);
});
