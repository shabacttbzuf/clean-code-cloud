import type { CapacitorConfig } from "@capacitor/cli";

const localServerUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "http://127.0.0.1:5173";

const config: CapacitorConfig = {
  appId: "com.shafiq.restaurantmanagement",
  appName: "نظام إدارة المطاعم",
  webDir: "android-web",
  server: {
    // Development wrapper: Android WebView reaches the Termux server on this phone.
    url: localServerUrl,
    cleartext: localServerUrl.startsWith("http://"),
    allowNavigation: ["127.0.0.1", "localhost"],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
