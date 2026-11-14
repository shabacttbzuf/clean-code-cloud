import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Theme = "light" | "dark";
export type DesignSettings = {
  background: string;
  primary: string;
  accent: string;
  sidebar: string;
  card: string;
  backgroundImage: string;
};
type Ctx = { theme: Theme; toggle: () => void; design: DesignSettings; saveDesign: (next: DesignSettings) => void; resetDesign: () => void };

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "ras-theme";
export const DESIGN_STORAGE_KEY = "ras-design-customization-v1";
export const DESIGN_UPDATED_EVENT = "ras-design-updated";
export const DEFAULT_DESIGN: DesignSettings = {
  background: "#f4f7f5",
  primary: "#176b52",
  accent: "#d7a83e",
  sidebar: "#173d32",
  card: "#ffffff",
  backgroundImage: "",
};

// Personal appearance settings are namespaced by the authenticated account.
// This prevents two people sharing the same browser/device from overwriting
// each other's theme and design preferences.
function scopedKey(base: string, userId: string | null) {
  return `${base}:${userId ?? "guest"}`;
}

function readDesign(userId: string | null): DesignSettings {
  try {
    const raw = window.localStorage.getItem(scopedKey(DESIGN_STORAGE_KEY, userId));
    if (!raw) return DEFAULT_DESIGN;
    const parsed = JSON.parse(raw) as Partial<DesignSettings>;
    return { ...DEFAULT_DESIGN, ...parsed };
  } catch { return DEFAULT_DESIGN; }
}

function readTheme(userId: string | null): Theme | null {
  try {
    const value = window.localStorage.getItem(scopedKey(STORAGE_KEY, userId));
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

function applyDesign(design: DesignSettings, theme: Theme) {
  const root = document.documentElement;
  const dark = theme === "dark";
  root.style.setProperty("--background", dark ? `color-mix(in srgb, ${design.background} 22%, #101a17)` : design.background);
  root.style.setProperty("--primary", dark ? `color-mix(in srgb, ${design.primary} 82%, white)` : design.primary);
  root.style.setProperty("--accent", dark ? `color-mix(in srgb, ${design.accent} 82%, white)` : design.accent);
  root.style.setProperty("--sidebar", dark ? `color-mix(in srgb, ${design.sidebar} 75%, #050907)` : design.sidebar);
  root.style.setProperty("--card", dark ? `color-mix(in srgb, ${design.card} 22%, #18211e)` : design.card);
  root.style.setProperty(
    "--workspace-background-image",
    design.backgroundImage ? `url("${design.backgroundImage.replace(/["\\\\]/g, "")}")` : "none",
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [design, setDesign] = useState<DesignSettings>(DEFAULT_DESIGN);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    // Supabase emits INITIAL_SESSION through onAuthStateChange. Use that single
    // ordered source of truth instead of racing getSession() against later
    // SIGNED_IN / SIGNED_OUT events and potentially restoring a stale account.
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const storedTheme = readTheme(userId);
    const initial: Theme = storedTheme ?? (
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
    setTheme(initial);
    setDesign(readDesign(userId));
  }, [authReady, userId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    if (authReady) {
      try { window.localStorage.setItem(scopedKey(STORAGE_KEY, userId), theme); } catch { /* ignore */ }
    }
  }, [theme, userId, authReady]);

  useEffect(() => {
    applyDesign(design, theme);
  }, [design, theme]);

  useEffect(() => {
    const currentKey = scopedKey(DESIGN_STORAGE_KEY, userId);
    const sync = (event?: StorageEvent) => {
      if (!event || event.key === currentKey) setDesign(readDesign(userId));
    };
    window.addEventListener(DESIGN_UPDATED_EVENT, sync as EventListener);
    const onStorage = (event: StorageEvent) => sync(event);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DESIGN_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  const saveDesign = (next: DesignSettings) => {
    setDesign(next);
    try { window.localStorage.setItem(scopedKey(DESIGN_STORAGE_KEY, userId), JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(DESIGN_UPDATED_EVENT));
  };
  const resetDesign = () => {
    setDesign(DEFAULT_DESIGN);
    try { window.localStorage.removeItem(scopedKey(DESIGN_STORAGE_KEY, userId)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(DESIGN_UPDATED_EVENT));
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => t === "dark" ? "light" : "dark"), design, saveDesign, resetDesign }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
