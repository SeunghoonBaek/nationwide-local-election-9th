import { THEME_STORAGE_KEY } from "@/lib/theme";

/** Runs before paint to avoid a flash of the wrong theme. */
export function ThemeScript() {
  const code = `
(function () {
  var key = ${JSON.stringify(THEME_STORAGE_KEY)};
  try {
    var stored = localStorage.getItem(key);
    var pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var dark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
