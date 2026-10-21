"use client";

import * as React from "react";

export type CrmTheme = "light" | "dark";

interface CrmThemeContextValue {
  theme: CrmTheme;
  toggleTheme: () => void;
}

const CrmThemeContext = React.createContext<CrmThemeContextValue | null>(null);

const STORAGE_KEY = "zehri-crm-theme";
const THEME_CHANGE_EVENT = "zehri:crm-theme-change";

function getSystemTheme(): CrmTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): CrmTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark") return val;
  } catch {
    // Storage may be unavailable/restricted in some browser contexts
  }
  return null;
}

function notifyThemeChange(theme: CrmTheme | null) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } });
  window.dispatchEvent(event);
  document.dispatchEvent(event);
}

function applyThemeAttribute(theme: CrmTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-crm-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

function removeThemeAttribute() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-crm-theme");
  document.documentElement.style.colorScheme = "";
}

const BOOTSTRAP_SCRIPT = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-crm-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export function CrmThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [theme, setTheme] = React.useState<CrmTheme>(() => {
    return getStoredTheme() ?? getSystemTheme();
  });

  // Keep state and DOM in sync on mount and across system/storage changes
  React.useEffect(() => {
    const activeStored = getStoredTheme();
    const effectiveTheme: CrmTheme = activeStored ?? getSystemTheme();

    setTheme(effectiveTheme);
    applyThemeAttribute(effectiveTheme);
    notifyThemeChange(effectiveTheme);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setTheme(e.newValue);
        applyThemeAttribute(e.newValue);
        notifyThemeChange(e.newValue);
      }
    };

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMedia = (e: MediaQueryListEvent) => {
      // Follow system changes only when no explicit override is stored
      if (!getStoredTheme()) {
        const next: CrmTheme = e.matches ? "dark" : "light";
        setTheme(next);
        applyThemeAttribute(next);
        notifyThemeChange(next);
      }
    };

    window.addEventListener("storage", handleStorage);
    mql.addEventListener("change", handleMedia);

    return () => {
      window.removeEventListener("storage", handleStorage);
      mql.removeEventListener("change", handleMedia);
      removeThemeAttribute();
      notifyThemeChange(null);
    };
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next: CrmTheme = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Safe fallback if localStorage fails
      }
      applyThemeAttribute(next);
      notifyThemeChange(next);
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <CrmThemeContext.Provider value={value}>
      <script
        id="crm-theme-bootstrap"
        dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }}
      />
      {children}
    </CrmThemeContext.Provider>
  );
}

export function useCrmTheme(): {
  theme: CrmTheme;
  toggleTheme: () => void;
} {
  const context = React.useContext(CrmThemeContext);
  if (!context) {
    throw new Error("useCrmTheme must be used within a CrmThemeProvider");
  }
  return context;
}
