// Top menu shared by index.html and city.html.
// Shows Log in / Sign up, or Log out, depending on who is here.
(async () => {
  const nav = document.getElementById("nav");
  const { data } = await db.auth.getSession();

  if (data.session) {
    const logout = document.createElement("button");
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
      await db.auth.signOut();
      window.location.reload();
    });
    nav.appendChild(logout);
  } else {
    nav.innerHTML = '<a href="login.html">Log in</a><a href="signup.html">Sign up</a>';
  }
})();
