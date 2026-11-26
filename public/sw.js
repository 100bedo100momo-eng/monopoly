// Service Worker بسيط: تخزين الأصول الثابتة + صفحة الأساس للعمل دون اتصال
const CACHE = "property-kings-v1";
const PRECACHE = ["/", "/rules", "/manifest.webmanifest", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // لا نتدخل في WebSocket/Realtime
  if (url.pathname.startsWith("/realtime")) return;

  // الأصول الثابتة: cache-first مع تحديث خلفي
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
  // الصفحات: network-first مع احتياطي مخزّن
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((cache) => cache.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match("/")))
  );
});
