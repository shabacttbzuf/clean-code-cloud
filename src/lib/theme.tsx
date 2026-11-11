import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

function readDesign(): DesignSettings {
  try {
    const raw = window.localStorage.getItem(DESIGN_STORAGE_KEY);
    if (!raw) return DEFAULT_DESIGN;
    const parsed = JSON.parse(raw) as Partial<DesignSettings>;
    return { ...DEFAULT_DESIGN, ...parsed };
  } catch { return DEFAULT_DESIGN; }
}

function applyDesign(design: DesignSettings) {
  const root = document.documentElement;
  root.style.setProperty("--background", design.background);
  root.style.setProperty("--primary", design.primary);
  root.style.setProperty("--accent", design.accent);
  root.style.setProperty("--sidebar", design.sidebar);
  root.style.setProperty("--card", design.card);
  root.style.setProperty(
    "--workspace-background-image",
    design.backgroundImage ? `url("${design.backgroundImage.replace(/["\\\\]/g, "")}")` : "none",
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [design, setDesign] = useState<DesignSettings>(DEFAULT_DESIGN);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme = stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(initial);
    setDesign(readDesign());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    applyDesign(design);
  }, [design]);

  useEffect(() => {
    const sync = () => setDesign(readDesign());
    window.addEventListener(DESIGN_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DESIGN_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const saveDesign = (next: DesignSettings) => {
    setDesign(next);
    try { window.localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(DESIGN_UPDATED_EVENT));
  };
  const resetDesign = () => {
    setDesign(DEFAULT_DESIGN);
    try { window.localStorage.removeItem(DESIGN_STORAGE_KEY); } catch { /* ignore */ }
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
