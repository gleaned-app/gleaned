try {
  var t = localStorage.getItem("gleaned-theme") || "system";
  if (t !== "system") {
    document.documentElement.classList.add("theme-" + t);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
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
} catch {}
