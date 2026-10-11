const SUPABASE_URL = "https://ctqsufsamvayeccndmtm.supabase.co";
const SUPABASE_KEY = "sb_publishable_FWGp8XdnG44eekvGBhFcOQ_zqhdgE7B";
let lastError = "";

async function getAverage(name) {
  const url = SUPABASE_URL + "/rest/v1/ratings?select=stars&business=eq." + encodeURIComponent(name);
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const total = rows.reduce(function (sum, r) { return sum + r.stars; }, 0);
  return { average: total / rows.length, count: rows.length };
}

async function saveRating(name, value) {
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/ratings", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ business: name, stars: value })
    });
    if (!res.ok) {
      lastError = res.status + " " + (await res.text());
    }
    return res.ok;
  } catch (e) {
    lastError = "Network problem: " + e.message;
    return false;
  }
}

document.querySelectorAll(".rating").forEach(function (box) {
  const stars = box.querySelectorAll(".star");
  const text = box.querySelector(".rating-text");
  const name = box.dataset.business;

  const avgText = document.createElement("p");
  avgText.className = "rating-text";
  box.appendChild(avgText);

  function showStars(value) {
    stars.forEach(function (s) {
      s.classList.toggle("on", Number(s.dataset.value) <= value);
    });
    if (value > 0) {
      text.textContent = "You rated this " + value + " out of 5";
    }
  }

  async function showAverage() {
    if (!name) return;
    try {
      const data = await getAverage(name);
      if (data) {
        avgText.textContent = "Average " + data.average.toFixed(1) + " from " + data.count + (data.count === 1 ? " rating" : " ratings");
      } else {
        avgText.textContent = "No ratings yet";
      }
    } catch (e) {
      avgText.textContent = "";
    }
  }

  showStars(Number(localStorage.getItem("voted-" + name)) || 0);
  showAverage();

  stars.forEach(function (star) {
    star.addEventListener("click", async function () {
      if (!name) {
        text.textContent = "This box has no business name";
        return;
      }
      if (localStorage.getItem("voted-" + name)) {
        text.textContent = "You already rated this";
        return;
      }
      const value = Number(star.dataset.value);
      const ok = await saveRating(name, value);
      if (ok) {
        localStorage.setItem("voted-" + name, value);
        showStars(value);
        showAverage();
      } else {
        text.textContent = "Couldn't save: " + lastError;
      }
    });
  });
});

