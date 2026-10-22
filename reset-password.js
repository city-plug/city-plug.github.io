// Reset password: the emailed link brings the person here already verified
// by Supabase. They choose a new password, which follows the shared rules.

const intro = document.getElementById("intro");
const form = document.getElementById("reset-form");
const message = document.getElementById("message");
const button = document.getElementById("submit-btn");

let formShown = false;

// Did this page open from a reset link, or was it opened by hand?
const urlText = window.location.hash + window.location.search;
const cameFromLink = /type=recovery|code=|access_token=/.test(urlText);
const linkHadError = /error/.test(urlText);

function showForm() {
  if (formShown) return;
  formShown = true;
  intro.textContent = "Pick a strong password you have not used before.";
  form.style.display = "block";
  PasswordRules.attachChecklist(document.getElementById("password"));
}

function showExpired() {
  if (formShown) return;
  intro.textContent = "";
  message.className = "";
  message.innerHTML =
    'This reset link is not valid or has expired. <a href="forgot-password.html">Request a new one</a>.';
}

// Supabase announces a verified reset link with this event
db.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showForm();
});

// If the link already carried an error, say so straight away
if (linkHadError) {
  showExpired();
} else {
  // Otherwise give Supabase a moment to verify the link
  setTimeout(async () => {
    if (formShown) return;
    const { data } = await db.auth.getSession();
    if (cameFromLink && data.session) {
      showForm();
    } else {
      showExpired();
    }
  }, 3000);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "";

  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;

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
  button.textContent = "Saving...";

  const { error } = await db.auth.updateUser({ password: password });

  if (error) {
    button.disabled = false;
    button.textContent = "Save new password";
    if (error.code === "same_password") {
      message.textContent = "Please choose a different password from your old one.";
    } else {
      message.textContent = error.message;
    }
    return;
  }

  // Sign out so the person logs in fresh with the new password
  await db.auth.signOut();

  form.style.display = "none";
  intro.textContent = "";
  message.className = "ok";
  message.textContent = "Password changed. Taking you to log in...";
  setTimeout(() => { window.location.href = "login.html"; }, 2000);
});
