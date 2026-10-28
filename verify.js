(async function () {
  const box = document.getElementById("vf-box");
  if (!box) return;
  const statusEl = document.getElementById("vf-status");
  const form = document.getElementById("vf-form");
  const btn = document.getElementById("vf-btn");

  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data: biz } = await db
    .from("businesses").select("verified").eq("owner_id", user.id).maybeSingle();
  if (biz && biz.verified) {
    statusEl.textContent = "Your business is verified.";
    form.style.display = "none";
    return;
  }

  const { data: req } = await db
    .from("verification_requests").select("status").eq("owner_id", user.id).maybeSingle();
  if (req) {
       const messages = {
      pending: "Your request is being reviewed. This page will update when it's done.",
      approved: "Your request was approved. Your business is now verified.",
      rejected: "Your request was not approved. Contact us to try again."
    };
    statusEl.textContent = messages[req.status] || messages.rejected;

    form.style.display = "none";
    return;
  }

  function ext(file) {
    return (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const shop = document.getElementById("vf-shop").files[0];
    const idFile = document.getElementById("vf-id").files[0];

    if (!shop) { statusEl.textContent = "Add a photo of your shop or products."; return; }
    if (!shop.type.startsWith("image/") || (idFile && !idFile.type.startsWith("image/"))) {
      statusEl.textContent = "Only photos are allowed.";
      return;
    }
    if (shop.size > 5 * 1024 * 1024 || (idFile && idFile.size > 5 * 1024 * 1024)) {
      statusEl.textContent = "Each photo must be under 5 MB.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploading...";

    const stamp = Date.now();
    const shopPath = user.id + "/shop-" + stamp + "." + ext(shop);
    let idPath = null;

    let up = await db.storage.from("verification-docs").upload(shopPath, shop, { contentType: shop.type });
    if (up.error) {
      statusEl.textContent = up.error.message;
      btn.disabled = false; btn.textContent = "Submit for verification";
      return;
    }

    if (idFile) {
      idPath = user.id + "/id-" + stamp + "." + ext(idFile);
      up = await db.storage.from("verification-docs").upload(idPath, idFile, { contentType: idFile.type });
      if (up.error) {
        statusEl.textContent = up.error.message;
        btn.disabled = false; btn.textContent = "Submit for verification";
        return;
      }
    }

    const { error } = await db
      .from("verification_requests")
      .insert({ shop_photo_path: shopPath, id_photo_path: idPath });

    if (error) {
      statusEl.textContent = error.message;
      btn.disabled = false; btn.textContent = "Submit for verification";
      return;
    }

    statusEl.textContent = "Submitted. Your request is being reviewed.";
    form.style.display = "none";
  });
})();
