const ratings = document.querySelectorAll(".rating");

ratings.forEach(function (box) {
  const stars = box.querySelectorAll(".star");
  const text = box.querySelector(".rating-text");
  const name = box.dataset.business;

  function showStars(value) {
    stars.forEach(function (s) {
      s.classList.toggle("on", Number(s.dataset.value) <= value);
    });
    if (value > 0) {
      text.textContent = "You rated this " + value + " out of 5";
    }
  }

  const saved = Number(localStorage.getItem("rating-" + name)) || 0;
  showStars(saved);

  stars.forEach(function (star) {
    star.addEventListener("click", function () {
      const value = Number(star.dataset.value);
      localStorage.setItem("rating-" + name, value);
      showStars(value);
    });
  });
});

