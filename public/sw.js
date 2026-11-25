/* Public application shell only. Never cache tenant HTML, Supabase data, auth, or mutations. */
const CACHE_PREFIX = "restaurant-pwa-";
const STATIC_CACHE = CACHE_PREFIX + "static-v2";
const SHELL_CACHE = CACHE_PREFIX + "shell-v2";
const SHELL_URLS = ["/", "/offline.html", "/manifest.webmanifest", "/icons/app-icon.svg"];
const MAX_STATIC_ENTRIES = 180;

async function cachePublicShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  // The root route is explicitly ssr:false; only this generic public shell is cached.
  await shellCache.addAll(SHELL_URLS);
  const response = await shellCache.match("/");
  if (!response || !response.headers.get("content-type")?.includes("text/html")) return;

  const html = await response.clone().text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => /\.(?:js|mjs|css|woff2?|ttf|otf|eot)$/i.test(new URL(path, self.location.origin).pathname));
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(assetPaths.map(async (path) => {
    const url = new URL(path, self.location.origin);
    if (url.origin !== self.location.origin) return;
    try {
      const asset = await fetch(url.href, { credentials: "same-origin" });
      if (asset.ok && asset.type === "basic") await putStaticAsset(staticCache, url.href, asset);
      if (asset.ok && /\.css(?:$|\?)/i.test(path)) {
        const css = await asset.clone().text();
        const fonts = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
        await Promise.all(fonts.map(async (font) => {
          const fontUrl = new URL(font, url);
          if (fontUrl.origin !== self.location.origin || !/\.(?:woff2?|ttf|otf|eot)$/i.test(fontUrl.pathname)) return;
          try {
            const fontResponse = await fetch(fontUrl.href, { credentials: "same-origin" });
            if (fontResponse.ok && fontResponse.type === "basic") await putStaticAsset(staticCache, fontUrl.href, fontResponse);
          } catch { /* Optional font; cache it on first successful request. */ }
        }));
      }
    } catch { /* Optional build asset; never fail installation for one asset. */ }
  }));
  await trimStaticCache(staticCache);
}

async function trimStaticCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function putStaticAsset(cache, key, response) {
  try {
    await cache.put(key, response.clone());
    await trimStaticCache(cache);
  } catch (error) {
    // A full browser quota must not break page loading or the app install.
    if (error?.name === "QuotaExceededError") {
      const keys = await cache.keys();
      if (keys.length) await cache.delete(keys[0]);
      try { await cache.put(key, response.clone()); } catch { /* Continue online without caching. */ }
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cachePublicShell();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, SHELL_CACHE].includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSensitiveOrApiPath(pathname) {
  return /\/(rest\/v1|auth\/v1|functions\/v1|storage\/v1)(\/|$)/i.test(pathname)
    || /\/api(\/|$)/i.test(pathname);
}

function isCacheablePublicResponse(response) {
  if (!response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/private|no-store|no-cache/i.test(cacheControl)) return false;
  if (response.headers.get("vary") === "*") return false;
  return true;
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
        // Only "/" is a public client-rendered shell. Never cache other route HTML.
        if (url.pathname === "/" && isCacheablePublicHtml(response)) {
          const cache = await caches.open(SHELL_CACHE);
          try { await cache.put("/", response.clone()); } catch { /* Storage quota: keep network response. */ }
        }
        return response;
      } catch {
        return (await caches.match("/")) || (await caches.match("/offline.html")) || Response.error();
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
      if (isCacheablePublicResponse(response)) await putStaticAsset(cache, request, response);
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
