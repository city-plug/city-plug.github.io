// This one page does two jobs, based on the address:
//   city.html?city=Auchi                  -> shows the categories in Auchi
//   city.html?city=Auchi&category=Food    -> shows the Food businesses in Auchi
const params = new URLSearchParams(window.location.search);
const city = params.get("city");
const category = params.get("category");

const title = document.getElementById("title");
const back = document.getElementById("back");
const statusEl = document.getElementById("status");
const categoriesBox = document.getElementById("categories");
const list = document.getElementById("list");

// Unknown city in the address: go back to the city list
if (!CITIES.includes(city)) {
  window.location.href = "index.html";
} else if (!category) {
  showCategories();
} else {
  showBusinesses();
}

// Job 1: category tiles for this city
function showCategories() {
  title.textContent = city;

  CATEGORIES.forEach((cat) => {
    const tile = document.createElement("a");
    tile.className = "tile";
    tile.href = "city.html?city=" + encodeURIComponent(city) +
                "&category=" + encodeURIComponent(cat);
    tile.textContent = cat;
    categoriesBox.appendChild(tile);
  });
}

// Job 2: businesses in this city AND this category
async function showBusinesses() {
  title.textContent = category + " in " + city;
  back.textContent = "← " + city;
  back.href = "city.html?city=" + encodeURIComponent(city);
  statusEl.textContent = "Loading businesses...";

  const { data: businesses, error } = await db
    .from("businesses")
    .select("id, name, description")
    .eq("city", city)
    .eq("category", category)
    .order("created_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Could not load businesses: " + error.message;
    return;
  }

  if (businesses.length === 0) {
    statusEl.textContent = "No " + category + " businesses in " + city + " yet.";
    return;
  }

  statusEl.textContent = "";

  businesses.forEach((b) => {
    // Each business card is a link to its own page
    const card = document.createElement("a");
    card.className = "biz";
    card.href = "business.html?id=" + b.id;

    const name = document.createElement("h2");
  name.textContent = b.name;
if (b.verified) {
  const badge = document.createElement("span");
  badge.className = "vbadge";
  badge.textContent = "\u2713 Verified";
  name.appendChild(badge);
}


    const desc = document.createElement("p");
    desc.textContent = b.description;

    card.append(name, desc);
    list.appendChild(card);
  });
}
