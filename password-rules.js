// Shared password rules for every page that sets a password
// (signup and reset-password). Change a rule here and it changes everywhere.
//
//   PasswordRules.firstProblem(pw)   -> text of the first missing rule, or "" if fine
//   PasswordRules.attachChecklist(el) -> shows a live checklist under a password box

const PasswordRules = (() => {
  const MIN_LENGTH = 10;

  // Same symbol list that Supabase counts as a symbol
  const SYMBOL = /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,.\/`~]/;

  const RULES = [
    { label: "At least " + MIN_LENGTH + " characters", test: (p) => p.length >= MIN_LENGTH },
    { label: "A small letter (a-z)", test: (p) => /[a-z]/.test(p) },
    { label: "A capital letter (A-Z)", test: (p) => /[A-Z]/.test(p) },
    { label: "A number (0-9)", test: (p) => /[0-9]/.test(p) },
    { label: "A symbol, like ! @ # $ %", test: (p) => SYMBOL.test(p) }
  ];

  // Returns the message for the first rule that is not met, or "" if all are met
  function firstProblem(password) {
    const failed = RULES.find((rule) => !rule.test(password));
    return failed ? "Password needs: " + failed.label.toLowerCase() + "." : "";
  }

  // Adds a small checklist under a password input that updates as the person types
  function attachChecklist(input) {
    addStyleOnce();

    const list = document.createElement("ul");
    list.className = "pw-rules";

    const items = RULES.map((rule) => {
      const li = document.createElement("li");
      li.textContent = rule.label;
      list.appendChild(li);
      return li;
    });

    input.insertAdjacentElement("afterend", list);

    function update() {
      RULES.forEach((rule, i) => {
        items[i].className = rule.test(input.value) ? "met" : "";
      });
    }

    input.addEventListener("input", update);
    update();
  }

  function addStyleOnce() {
    if (document.getElementById("pw-rules-style")) return;
    const style = document.createElement("style");
    style.id = "pw-rules-style";
    style.textContent =
      ".pw-rules{list-style:none;margin:6px 0 10px;padding:0;font-size:13px;color:#8e8e93}" +
      ".pw-rules li{padding:2px 0 2px 20px;position:relative}" +
      ".pw-rules li::before{content:'○';position:absolute;left:0}" +
      ".pw-rules li.met{color:#1f9d55}" +
      ".pw-rules li.met::before{content:'✓'}";
    document.head.appendChild(style);
  }

  return { firstProblem, attachChecklist, MIN_LENGTH };
})();
