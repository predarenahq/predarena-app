import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem("preda-theme") as Theme | null;
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, [theme]);

  // Persist ONLY on an explicit toggle. The old effect wrote on mount too, so a
  // first-time visitor had "light" saved as a preference they never expressed.
  const persist = useCallback((t: Theme) => {
    try { window.localStorage.setItem("preda-theme", t); } catch (e) { /* private mode */ }
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, [persist]);

  return { theme, toggle };
}
