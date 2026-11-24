const CACHE_NAME = "restaurant-app-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg", "/favicon.ico"];
const MAX_CACHED_ASSETS = 250;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("restaurant-app-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

function isBackendRequest(url) {
  return /^\/(?:rest\/v1|auth\/v1|storage\/v1|functions\/v1|realtime|graphql|api)(?:\/|$)/i.test(
    url.pathname,
  );
}

async function trimAssetCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_ASSETS) return;
  await Promise.all(keys.slice(0, keys.length - MAX_CACHED_ASSETS).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isBackendRequest(url)) return;
  if (request.headers.has("authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlinePage = await caches.match(OFFLINE_URL);
        return (
          offlinePage ||
          new Response("أنت غير متصل بالإنترنت. أعد الاتصال ثم حاول مجدداً.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  const isStaticAsset =
    ["script", "style", "font", "image"].includes(request.destination) ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_build/");
  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.type !== "opaque") {
          await cache.put(request, response.clone());
          await trimAssetCache(cache);
        }
        return response;
      } catch {
        return (
          (await cache.match(request)) ||
          new Response("", { status: 503, statusText: "Offline" })
        );
      }
    })(),
  );
});
