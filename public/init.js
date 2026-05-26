try {
  var t = localStorage.getItem("gleaned-theme") || "system";
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (t !== "system") {
    document.documentElement.classList.add("theme-" + t);
  } else if (prefersDark) {
    document.documentElement.classList.add("theme-dark");
  }
  var f = localStorage.getItem("gleaned-font") || "sans";
  var fm = {
    sans: "var(--font-dm-sans),ui-sans-serif,system-ui,sans-serif",
    serif: "var(--font-lora),Georgia,serif",
    playfair: "var(--font-playfair),Georgia,serif",
    handwriting: "var(--font-caveat),cursive",
  };
  document.documentElement.style.setProperty("--font-body", fm[f] || fm.sans);
  var l = localStorage.getItem("gleaned-lang") || "de";
  document.documentElement.lang = l;
  // Set theme-color meta before React hydrates so the status bar matches immediately
  var tc = { light: "#F3EDE3", dark: "#15100C", sepia: "#DDD0A8" };
  var eff = (t === "system") ? (prefersDark ? "dark" : null) : t;
  if (eff && tc[eff]) {
    var m = document.createElement("meta");
    m.name = "theme-color";
    m.content = tc[eff];
    m.dataset.dynamic = "true";
    document.head.appendChild(m);
  }
} catch {}
