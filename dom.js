// dom.js
// Tiny shared helper for building page elements.
// Load it right after config.js, before any file that uses Dom.
const Dom = (() => {
  // Creates an element with an optional class name and plain text
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  return { el };
})();
