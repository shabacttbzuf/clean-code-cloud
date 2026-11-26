/**
 * Shared semantic design tokens.
 *
 * Values are defined once in src/styles.css as CSS custom properties. This
 * module exposes stable names for components without duplicating color values.
 */
export const designTokens = {
  color: {
    background: "var(--background)",
    foreground: "var(--foreground)",
    surface: "var(--card)",
    surfaceForeground: "var(--card-foreground)",
    primary: "var(--primary)",
    primaryForeground: "var(--primary-foreground)",
    secondary: "var(--secondary)",
    muted: "var(--muted)",
    mutedForeground: "var(--muted-foreground)",
    accent: "var(--accent)",
    border: "var(--border)",
    input: "var(--input)",
    ring: "var(--ring)",
    success: "var(--success)",
    warning: "var(--warning)",
    destructive: "var(--destructive)",
    brandNavy: "var(--brand-navy)",
    brandGold: "var(--brand-gold)",
    brandWhite: "var(--brand-white)",
  },
  radius: {
    control: "var(--radius-control)",
    card: "var(--radius-card)",
    dialog: "var(--radius-dialog)",
    pill: "var(--radius-pill)",
  },
  shadow: {
    soft: "var(--shadow-soft)",
    card: "var(--shadow-card)",
    elevated: "var(--shadow-elevated)",
  },
  typography: {
    arabic: "var(--font-arabic)",
    latin: "var(--font-latin)",
    mono: "var(--font-mono)",
  },
} as const;

export type DesignColorToken = keyof typeof designTokens.color;
export type DesignRadiusToken = keyof typeof designTokens.radius;
export type DesignShadowToken = keyof typeof designTokens.shadow;
