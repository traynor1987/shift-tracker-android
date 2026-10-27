const WEB_VERSION = "2.1.246";
const CACHE_SEQUENCE = 168;
const CACHE_PREFIX = "shift-tracker-v";
const CACHE = `${CACHE_PREFIX}${CACHE_SEQUENCE}`;
const CORE = ["/", "/manifest.webmanifest", "/pwa-register.js", "/icons/shift-clock-192.png", "/icons/shift-clock-512.png"];

const appCacheSequence = (name) => {
  const match = new RegExp(`^${CACHE_PREFIX}(\\d+)$`).exec(name);
  return match ? Number(match[1]) : null;
};

const isApiRequest = (url) => url.pathname === "/api" || url.pathname.startsWith("/api/");

const isStaticAsset = (url) =>
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/pwa-register.js" ||
  url.pathname === "/favicon.svg";

const isNavigation = (request) => request.mode === "navigate";

const isSuitableRequest = (request, url) =>
  request.method === "GET" &&
  url.origin === self.location.origin &&
  !isApiRequest(url) &&
  (isNavigation(request) || isStaticAsset(url));

const isHtmlResponse = (response) =>
  (response.headers.get("Content-Type") || "").toLowerCase().includes("text/html");

const isSuitableResponse = (response, allowHtml) => {
  if (!response || !response.ok || response.status === 206) return false;
  if (["error", "opaque", "opaqueredirect"].includes(response.type)) return false;
  if (/\bno-store\b/i.test(response.headers.get("Cache-Control") || "")) return false;
  if ((response.headers.get("Vary") || "").trim() === "*") return false;
  if (!allowHtml && isHtmlResponse(response)) return false;
  if (response.url && new URL(response.url).origin !== self.location.origin) return false;
  return true;
};

async function retainedAppCacheNames() {
  const names = await caches.keys();
  const previous = names
    .map((name) => ({ name, sequence: appCacheSequence(name) }))
    .filter((item) => item.sequence !== null && item.sequence < CACHE_SEQUENCE)
    .sort((left, right) => right.sequence - left.sequence)[0]?.name;
  return previous ? [CACHE, previous] : [CACHE];
}

async function trimOldAppCaches() {
  const names = await caches.keys();
  const keep = new Set(await retainedAppCacheNames());
  await Promise.all(names.map((name) => {
    const sequence = appCacheSequence(name);
    // Never let an older worker delete a cache created by a newer release.
    if (sequence === null || sequence > CACHE_SEQUENCE || keep.has(name)) return false;
    return caches.delete(name);
  }));
}

async function matchRetainedAppCache(request, allowHtml) {
  for (const name of await retainedAppCacheNames()) {
    const cache = await caches.open(name);
    const response = await cache.match(request);
    if (response && (allowHtml || !isHtmlResponse(response))) return response;
  }
  return null;
}

async function fetchAndCache(cache, request, allowHtml) {
  const response = await fetch(request, { cache: "reload", credentials: "same-origin" });
  if (!isSuitableResponse(response, allowHtml)) throw new Error("Response is not suitable for the app cache");
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((path) => fetchAndCache(cache, new URL(path, self.location.origin).href, path === "/")));
    const manifestResponse = await fetch(new URL("/offline-assets.json", self.location.origin).href, { cache: "reload", credentials: "same-origin" });
    if (!isSuitableResponse(manifestResponse, false)) throw new Error("Offline asset manifest unavailable");
    const manifest = await manifestResponse.json();
    if (manifest.version !== WEB_VERSION || !Array.isArray(manifest.urls)) throw new Error("Offline asset manifest version mismatch");
    const urls = manifest.urls.map((path) => {
      if (typeof path !== "string") throw new Error("Invalid offline asset path");
      const url = new URL(path, self.location.origin);
      if (url.origin !== self.location.origin || !isStaticAsset(url)) throw new Error("Invalid offline asset URL");
      return url.href;
    });
    // Installation is atomic from the user's perspective: only claim this
    // release once every lazy module and its build dependencies are available.
    await Promise.all([...new Set(urls)].map((url) => fetchAndCache(cache, url, false)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(trimOldAppCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || event.data.version !== WEB_VERSION || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.flatMap((value) => {
    if (typeof value !== "string") return [];
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin && isStaticAsset(url) ? [url.href] : [];
    } catch {
      return [];
    }
  }))];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(urls.map((url) => fetchAndCache(cache, url, false)));
    await trimOldAppCaches();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch { return; }

  // Provider resources and every API call are deliberately network-only. They
  // must never consume the app-shell cache or receive an offline HTML fallback.
  if (url.origin !== self.location.origin || isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.method !== "GET") return;
  if (!isSuitableRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (!isNavigation(request) && isHtmlResponse(response)) {
        const previousExact = await matchRetainedAppCache(request, false);
        if (previousExact) return previousExact;
        return Response.error();
      }
      if (!response.ok) {
        const previousExact = await matchRetainedAppCache(request, isNavigation(request));
        if (previousExact) return previousExact;
        return response;
      }
      if (isSuitableResponse(response, isNavigation(request)) && request.cache !== "no-store") {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        } catch { /* A cache write must never hide a successful network response. */ }
      }
      return response;
    } catch {
      const exact = await matchRetainedAppCache(request, isNavigation(request));
      if (exact) return exact;
      if (isNavigation(request)) {
        const shell = await matchRetainedAppCache(new URL("/", self.location.origin).href, true);
        if (shell) return shell;
      }
      // Assets fail as a network error; they are never replaced with app HTML.
      return Response.error();
    }
  })());
});
