const citiesBox = document.getElementById("cities");

// Show one tile per city (the list comes from config.js)
function showCities(counts) {
  citiesBox.innerHTML = "";

  CITIES.forEach((city) => {
    const tile = document.createElement("a");
    tile.className = "tile";
    tile.href = "city.html?city=" + encodeURIComponent(city);
    tile.textContent = city;

    const small = document.createElement("small");
    const n = counts[city] || 0;
    small.textContent = n + (n === 1 ? " business" : " businesses");
    tile.appendChild(small);

    citiesBox.appendChild(tile);
  });
}

// Show tiles right away, then fill in the business counts
showCities({});

(async () => {
  const { data } = await db.from("businesses").select("city");
  if (!data) return;

  const counts = {};
  data.forEach((row) => {
    counts[row.city] = (counts[row.city] || 0) + 1;
  });
  showCities(counts);
})();

