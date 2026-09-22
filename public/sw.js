const CACHE_NAME = "hbaf-portal-v4";
const APP_SHELL = [
  "/",
  "/css/base.css",
  "/css/home.css",
  "/css/reservation.css",
  "/css/board.css",
  "/css/game.css",
  "/css/vet.css",
  "/css/suggestions.css",
  "/css/auth.css",
  "/js/auth.js",
  "/js/app.js",
  "/js/weather.js",
  "/js/time-slider.js",
  "/js/meeting-room.js",
  "/js/vehicle.js",
  "/js/board.js",
  "/js/game.js",
  "/js/vet.js",
  "/js/suggestions.js",
  "/js/admin-users.js",
  "/assets/img/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// 예약/게시글 등은 항상 실시간 데이터여야 하므로 /api/ 는 캐시하지 않고 그냥 네트워크로 흘려보낸다.
// 그 외 정적 파일은 "네트워크 우선, 실패하면 캐시" 방식이라 오프라인일 때도 화면은 뜬다.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request))
  );
});
