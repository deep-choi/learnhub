export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "learnhub_theme";
export const THEME_CHANGED_EVENT = "learnhub:theme_changed";

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  
  // Default to system preference if available
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
};

export const applyThemeToDom = (theme: ThemeMode) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
};

export const setTheme = (theme: ThemeMode) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  applyThemeToDom(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme } }));
  }
};

export const toggleTheme = (): ThemeMode => {
  const current = getStoredTheme();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
};

// Initialize theme on script load
if (typeof window !== "undefined") {
  const initialTheme = getStoredTheme();
  applyThemeToDom(initialTheme);
}
