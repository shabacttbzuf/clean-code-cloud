/* Offline shell only. Never cache Supabase data, auth responses, or mutations. */
const CACHE_PREFIX = "restaurant-pwa-";
const STATIC_CACHE = CACHE_PREFIX + "static-v1";
const SHELL_CACHE = CACHE_PREFIX + "shell-v1";
const SHELL_URLS = ["/", "/offline.html", "/manifest.webmanifest", "/icons/app-icon.svg"];

async function precacheShellAssets() {
  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.addAll(SHELL_URLS);

  // "/" is a public client-rendered shell (the route has ssr:false).
  const shellResponse = await shellCache.match("/");
  if (!shellResponse) return;
  const html = await shellResponse.text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => /\\.(?:js|mjs|css|woff2?|ttf|otf|eot)$/i.test(new URL(path, self.location.origin).pathname));

  const staticCache = await caches.open(STATIC_CACHE);
  const cssPaths = assetPaths.filter((path) => /\\.css(?:$|\\?)/i.test(path));
  await Promise.all(assetPaths.map(async (path) => {
    const url = new URL(path, self.location.origin);
    if (url.origin !== self.location.origin) return;
    try {
      const response = await fetch(url.href);
      if (response.ok && response.type === "basic") await staticCache.put(url.href, response.clone());
      if (response.ok && cssPaths.includes(path)) {
        const css = await response.clone().text();
        const fonts = [...css.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)].map((match) => match[1]);
        await Promise.all(fonts.map(async (font) => {
          const fontUrl = new URL(font, url);
          if (fontUrl.origin !== self.location.origin || !/\\.(?:woff2?|ttf|otf|eot)$/i.test(fontUrl.pathname)) return;
          try {
            const fontResponse = await fetch(fontUrl.href);
            if (fontResponse.ok && fontResponse.type === "basic") await staticCache.put(fontUrl.href, fontResponse);
          } catch { /* A font can be fetched and cached on its first later use. */ }
        }));
      }
    } catch { /* Optional build assets are cached when first requested. */ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheShellAssets();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, SHELL_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSensitiveOrApiPath(pathname) {
  return /\/(rest\/v1|auth\/v1|functions\/v1|storage\/v1)(\/|$)/i.test(pathname)
    || /\/api(\/|$)/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveOrApiPath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // The "/" route is explicitly ssr:false in this app, so its HTML is a
        // public application shell rather than user- or tenant-specific markup.
        if (response.ok && url.pathname === "/" && response.headers.get("content-type")?.includes("text/html")) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        const shell = await caches.match("/");
        return shell || (await caches.match("/offline.html")) || Response.error();
      }
    })());
    return;
  }

  const isStaticAsset = /\.(?:js|mjs|css|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|ico)$/i.test(url.pathname)
    || url.pathname.startsWith("/assets/");
  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
