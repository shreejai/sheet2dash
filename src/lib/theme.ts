// Theme preference: "light" | "dark" in localStorage, or absent for "follow the OS".
// Dark mode is the `.dark` class on <html> (Tailwind's dark variant and the chart tokens use it).

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Keep in sync with `applyTheme` in components/theme-toggle.tsx.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
