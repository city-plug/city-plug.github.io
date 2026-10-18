// An owner's "my business" page is now the full business page,
// so this file just finds their business and sends them there.
(async () => {
  const { data } = await db.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  const { data: business } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", data.session.user.id)
    .maybeSingle();

  if (!business) {
    // No business yet: go create one
    window.location.href = "create-business.html";
    return;
  }

  window.location.href = "business.html?id=" + business.id;
})();

document.getElementById("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  window.location.href = "login.html";
});
