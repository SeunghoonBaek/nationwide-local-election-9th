export const THEME_STORAGE_KEY = "election-june-theme";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "light", label: "밝게" },
  { value: "dark", label: "어둡게" },
  { value: "system", label: "시스템" },
];

export function resolveDark(preference: ThemePreference): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeToDocument(preference: ThemePreference): void {
  const root = document.documentElement;
  if (resolveDark(preference)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "system";
}
