// business-banner.js
// One picture per business, shown as a full-width banner behind the business name.
// Customers see it; only the owner can upload, replace or remove it.
// Load it AFTER config.js and dom.js, and BEFORE business.js.
// The banner styles live in business-banner.css, the owner card in owner-card.css.
const BusinessBanner = (() => {
  const el = Dom.el;

  const BUCKET = "product-images";
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_INPUT_BYTES = 8 * 1024 * 1024; // the picture is shrunk before upload
  const MAX_WIDTH = 1600;
  const JPEG_QUALITY = 0.85;

  let current = null; // the banner now on the page, and how to undo it

  // ---------- Helpers ----------

  function publicUrl(path) {
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function extFor(type) {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    return "jpg";
  }

  // Moves a node into a container and gives back a function that puts it back
  function moveInto(node, container) {
    if (!node) return () => {};
    const marker = document.createComment("");
    node.replaceWith(marker);
    container.appendChild(node);
    return () => marker.replaceWith(node);
  }

  // Shrinks big phone photos so they upload fast and still look sharp
  async function prepareImage(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, MAX_WIDTH / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (blob) return blob;
    } catch (e) {
      // fall back to the original file
    }
    return file;
  }

  // ---------- The banner on the page ----------

  function clear() {
    if (!current) return;
    current.restores.forEach((undo) => undo());
    current.banner.remove();
    current = null;
  }

  function show(business) {
    clear();
    if (!business || !business.banner_path) return;

    const section = document.getElementById("bizSection");
    if (!section) return;

    const img = document.createElement("img");
    img.src = publicUrl(business.banner_path);
    img.alt = business.name;
    img.addEventListener("error", clear); // never leave a broken picture behind

    const text = el("div", "banner-text");
    const banner = el("div", "banner");
    banner.append(img, text);
    section.prepend(banner);

    current = {
      banner,
      restores: [
        moveInto(document.getElementById("bizName"), text),
        moveInto(document.getElementById("bizTag"), text)
      ]
    };
  }

  // ---------- Saving and removing ----------

  async function save(business, file, ownerId) {
    const blob = await prepareImage(file);
    const path = ownerId + "/banner-" + Date.now() + "." + extFor(blob.type);

    const upload = await db.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: "3600" });
    if (upload.error) throw upload.error;

    const { data, error } = await db
      .from("businesses")
      .update({ banner_path: path })
      .eq("id", business.id)
      .select("id");

    if (error || !data || data.length === 0) {
      await db.storage.from(BUCKET).remove([path]); // do not leave a stray file
      throw error || new Error("Not allowed to change this business.");
    }

    const old = business.banner_path;
    business.banner_path = path;
    if (old) await db.storage.from(BUCKET).remove([old]);
  }

  async function remove(business) {
    const old = business.banner_path;
    if (!old) return;

    const { data, error } = await db
      .from("businesses")
      .update({ banner_path: null })
      .eq("id", business.id)
      .select("id");

    if (error || !data || data.length === 0) {
      throw error || new Error("Not allowed to change this business.");
    }

    business.banner_path = null;
    await db.storage.from(BUCKET).remove([old]);
  }

  // ---------- The owner's card ----------

  function mountOwnerBox(beforeEl, business) {
    if (!beforeEl || !business) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ALLOWED_TYPES.join(",");
    input.hidden = true;

    const uploadBtn = el("button", "ocard-btn primary");
    uploadBtn.type = "button";

    const removeBtn = el("button", "ocard-btn secondary", "Remove picture");
    removeBtn.type = "button";

    const msg = el("p", "ocard-hint");
    msg.hidden = true;

    const say = (text) => {
      msg.textContent = text;
      msg.hidden = !text;
    };

    const refresh = () => {
      uploadBtn.textContent = business.banner_path ? "Replace picture" : "Upload picture";
      removeBtn.hidden = !business.banner_path;
    };

    const setBusy = (on, label) => {
      uploadBtn.disabled = on;
      removeBtn.disabled = on;
      if (on) uploadBtn.textContent = label;
      else refresh();
    };

    uploadBtn.addEventListener("click", () => input.click());

    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;

      if (!ALLOWED_TYPES.includes(file.type)) {
        say("Please choose a JPG, PNG or WebP picture.");
        return;
      }
      if (file.size > MAX_INPUT_BYTES) {
        say("That picture is too big. Please use one under 8MB.");
        return;
      }

      say("");
      setBusy(true, "Uploading...");
      try {
        const { data } = await db.auth.getSession();
        if (!data.session) throw new Error("Please log in again.");

        await save(business, file, data.session.user.id);
        show(business);
        say("Picture saved. Customers can see it now.");
      } catch (e) {
        say("Could not save the picture: " + e.message);
      }
      setBusy(false);
    });

    let armed = false;
    removeBtn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        removeBtn.textContent = "Tap again to remove";
        setTimeout(() => {
          armed = false;
          removeBtn.textContent = "Remove picture";
        }, 4000);
        return;
      }
      armed = false;

      say("");
      setBusy(true, "Removing...");
      try {
        await remove(business);
        show(business);
        say("Picture removed.");
      } catch (e) {
        say("Could not remove the picture: " + e.message);
      }
      removeBtn.textContent = "Remove picture";
      setBusy(false);
    });

    const titles = el("div");
    titles.append(
      el("h3", "ocard-title", "Business picture"),
      el("p", "ocard-sub", "One wide picture at the top of your page. A landscape photo works best.")
    );
    const head = el("div", "ocard-head");
    head.append(titles);

    const actions = el("div", "ocard-actions");
    actions.append(uploadBtn, removeBtn);

    const card = el("section", "ocard");
    card.append(head, actions, msg, input);
    beforeEl.before(card);

    refresh();
  }

  return { show, mountOwnerBox };
})();
