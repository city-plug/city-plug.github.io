// auth-route.js
// Decides where a signed-in person should go next.
// Used after logging in, and when someone lands on the login page already
// signed in (for example after tapping the confirmation link in their email).
// Load it AFTER config.js and return-to.js.
const AuthRoute = (() => {
  async function destinationFor(user) {
    const { data: business } = await db
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (business) {
      ReturnTo.clear();
      return "my-business.html";
    }

    const role = user.user_metadata && user.user_metadata.role;
    if (role === "owner") {
      ReturnTo.clear();
      return "create-business.html";
    }

    return ReturnTo.take() || "index.html";
  }

  async function goIfSignedIn() {
    const { data } = await db.auth.getSession();
    if (!data.session) return false;

    window.location.replace(await destinationFor(data.session.user));
    return true;
  }

  return { destinationFor, goIfSignedIn };
})();
