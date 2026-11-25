// Keep only the glyph subsets used by the Arabic-first interface.
// This avoids bundling unrelated Greek, Cyrillic, Vietnamese and extended
// Latin font files while retaining Cairo for Arabic and Inter for Latin text.
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-500.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
