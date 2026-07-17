import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

/**
 * Theme lives in a context, not in a component.
 *
 * It used to be a plain hook called in ONE place - inside the homepage. That
 * had two consequences: refreshing any other route left the app in light mode
 * (fixed by the inline script in index.html), and the toggle only existed on
 * desktop, because the header holding it is lg:-gated. Mounting a second
 * <useTheme()> in the mobile drawer would have created a SECOND useState over
 * the same localStorage key - two sources of truth that drift apart.
 *
 * One provider, one state, toggle mountable anywhere.
 */
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    // Read the attribute the inline script in index.html already set before
    // first paint, rather than re-deriving it and risking a mismatch.
    if (document.documentElement.getAttribute("data-theme") === "dark") return "dark";
    try {
      return window.localStorage.getItem("preda-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, [theme]);

  // Persist ONLY on an explicit toggle. The old effect wrote on mount too, so a
  // first-time visitor had "light" saved as a preference they never expressed.
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try { window.localStorage.setItem("preda-theme", next); } catch { /* private mode */ }
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
