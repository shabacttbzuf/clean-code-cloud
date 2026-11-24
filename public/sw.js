/* Offline shell only. Never cache Supabase data, auth responses, or mutations. */
const CACHE_PREFIX = "restaurant-pwa-";
const STATIC_CACHE = CACHE_PREFIX + "static-v1";
const SHELL_CACHE = CACHE_PREFIX + "shell-v1";
const SHELL_URLS = ["/", "/offline.html", "/manifest.webmanifest", "/icons/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
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
