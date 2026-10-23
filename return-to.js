// return-to.js
// Remembers which page a visitor came from, so after they log in or sign up
// they are sent back there (for example, to the business whose link they tapped).
// Only plain pages on this site are accepted, never outside addresses.
const ReturnTo = (() => {
  const KEY = "cp_return_to";
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // forget after 24 hours
  const SAFE_TARGET = /^[a-z0-9_-]+\.html(\?[a-z0-9=&%._-]*)?$/i;
  const NEVER = ["login.html", "signup.html", "forgot-password.html", "reset-password.html"];

  function isSafe(target) {
    if (typeof target !== "string" || !SAFE_TARGET.test(target)) return false;
    return !NEVER.includes(target.split("?")[0].toLowerCase());
  }

  function currentPage() {
    return window.location.pathname.split("/").pop() + window.location.search;
  }

  function remember(target) {
    if (!isSafe(target)) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify({ target: target, at: Date.now() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  // The remembered page, or null if there is none, it is too old, or it is not safe
  function peek() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved || Date.now() - saved.at > MAX_AGE_MS) return null;
      return isSafe(saved.target) ? saved.target : null;
    } catch (e) {
      return null;
    }
  }

  // Gives the remembered page once, then forgets it
  function take() {
    const target = peek();
    clear();
    return target;
  }

  // On the login and signup pages: pick up ?next= from the address bar
  function stashFromQuery() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) remember(next);
  }

  // login.html or signup.html, carrying this page along
  function linkTo(page) {
    const here = currentPage();
    return isSafe(here) ? page + "?next=" + encodeURIComponent(here) : page;
  }

  // "Please log in or sign up to pay." with both links, and remembers this page
  function promptHtml(reason) {
    remember(currentPage());
    return (
      'Please <a href="' + linkTo("login.html") + '">log in</a> or ' +
      '<a href="' + linkTo("signup.html") + '">sign up</a> ' + reason + "."
    );
  }

  return { remember, peek, take, clear, stashFromQuery, linkTo, promptHtml };
})();
