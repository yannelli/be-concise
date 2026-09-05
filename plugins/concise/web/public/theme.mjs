(() => {
  const key = "concise-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => ["light", "dark", "system"].includes(value);
  let preference = "system";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch {}

  function apply() {
    const dark = preference === "dark" || (preference === "system" && system.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('link[rel="icon"]').href = dark ? "/icon-dark.svg" : "/icon.svg";
    const control = document.getElementById("theme");
    if (control) control.value = preference;
  }

  apply();
  system.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      preference = valid(event.newValue) ? event.newValue : "system";
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    const control = document.getElementById("theme");
    control.value = preference;
    control.addEventListener("change", () => {
      preference = control.value;
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
