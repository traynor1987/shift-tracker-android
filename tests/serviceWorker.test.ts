import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const ORIGIN = "https://shift-tracker.test";
const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const currentSequence = Number(workerSource.match(/const CACHE_SEQUENCE = (\d+);/)?.[1]);
const CURRENT_CACHE = `shift-tracker-v${currentSequence}`;
const CURRENT_VERSION = workerSource.match(/const WEB_VERSION = "([^"]+)";/)?.[1];
const FUTURE_CACHE = `shift-tracker-v${currentSequence + 1}`;

assert.ok(Number.isSafeInteger(currentSequence));
assert.ok(CURRENT_VERSION);

type TestRequest = {
  url: string;
  method: string;
  mode: string;
  cache: string;
};

const request = (path: string, options: Partial<Omit<TestRequest, "url">> = {}): TestRequest => ({
  url: new URL(path, ORIGIN).href,
  method: "GET",
  mode: "cors",
  cache: "default",
  ...options,
});

const cacheKey = (value: string | { url: string }) =>
  new URL(typeof value === "string" ? value : value.url, ORIGIN).href;

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(value: string | { url: string }) {
    return this.entries.get(cacheKey(value))?.clone();
  }

  async put(value: string | { url: string }, response: Response) {
    this.entries.set(cacheKey(value), response.clone());
  }
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>();

  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.stores.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }
}

function createWorker(network: (input: string | TestRequest, init?: RequestInit) => Promise<Response>) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cacheStorage = new MemoryCacheStorage();
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  let claims = 0;
  let skips = 0;
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: async () => { claims += 1; } },
    skipWaiting: async () => { skips += 1; },
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => listeners.set(type, listener),
  };
  const fetcher = async (input: string | TestRequest, init?: RequestInit) => {
    fetchCalls.push({ url: cacheKey(input), init });
    if (new URL(cacheKey(input)).pathname === "/offline-assets.json") {
      const response = await network(input, init);
      // Existing cache-policy scenarios predate the generated manifest.
      if ((await response.clone().text()) === "ok") return new Response(JSON.stringify({ version: CURRENT_VERSION, urls: [] }), { headers: { "Content-Type": "application/json" } });
      return response;
    }
    return network(input, init);
  };

  vm.runInNewContext(workerSource, {
    self,
    caches: cacheStorage,
    fetch: fetcher,
    URL,
    Response,
    Headers,
    console,
  });

  const waitFor = (type: string, fields: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    assert.ok(listener, `${type} listener should be installed`);
    listener({ ...fields, waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)) });
    return Promise.all(waits);
  };

  const dispatchFetch = (value: TestRequest) => {
    let response: Promise<Response> | null = null;
    const listener = listeners.get("fetch");
    assert.ok(listener, "fetch listener should be installed");
    listener({
      request: value,
      respondWith: (candidate: Promise<Response> | Response) => { response = Promise.resolve(candidate); },
    });
    return response as Promise<Response> | null;
  };

  const seed = async (cacheName: string, path: string, response: Response) => {
    const cache = await cacheStorage.open(cacheName);
    await cache.put(new URL(path, ORIGIN).href, response);
  };

  const cached = async (cacheName: string, path: string) =>
    (await cacheStorage.open(cacheName)).match(new URL(path, ORIGIN).href);

  return {
    cacheStorage,
    fetchCalls,
    waitFor,
    dispatchFetch,
    seed,
    cached,
    get claims() { return claims; },
    get skips() { return skips; },
  };
}

const ok = (body = "ok", contentType = "application/javascript") =>
  new Response(body, { status: 200, headers: { "Content-Type": contentType } });

test("upgrade activation retains the current and newest previous app cache only", async () => {
  const worker = createWorker(async () => ok());
  await worker.seed("shift-tracker-v39", "/", ok("39", "text/html"));
  await worker.seed("shift-tracker-v40", "/", ok("40", "text/html"));
  await worker.seed("shift-tracker-v41", "/", ok("41", "text/html"));
  await worker.seed("shift-tracker-v70", "/", ok("70", "text/html"));
  await worker.seed(CURRENT_CACHE, "/", ok("43", "text/html"));
  await worker.seed("other-product-cache", "/asset", ok());

  await worker.waitFor("activate");

  assert.deepEqual((await worker.cacheStorage.keys()).sort(), [CURRENT_CACHE, "other-product-cache", "shift-tracker-v70"].sort());
  assert.equal(worker.claims, 1);
});

test("an older worker never deletes a cache belonging to a future release", async () => {
  const worker = createWorker(async () => ok());
  await worker.seed("shift-tracker-v41", "/", ok("41", "text/html"));
  await worker.seed("shift-tracker-v70", "/", ok("70", "text/html"));
  await worker.seed(CURRENT_CACHE, "/", ok("44", "text/html"));
  await worker.seed(FUTURE_CACHE, "/", ok("future", "text/html"));

  await worker.waitFor("activate");

  assert.deepEqual((await worker.cacheStorage.keys()).sort(), [CURRENT_CACHE, "shift-tracker-v70", FUTURE_CACHE].sort());
});

test("CACHE_URLS is version-gated and accepts only successful same-origin static assets", async () => {
  const worker = createWorker(async (input) => {
    const path = new URL(cacheKey(input)).pathname;
    if (path.endsWith("bad.js")) return new Response("bad", { status: 503 });
    if (path.endsWith("private.js")) return new Response("private", { status: 200, headers: { "Cache-Control": "no-store" } });
    if (path.endsWith("html.js")) return ok("<html>wrong</html>", "text/html");
    return ok(`asset:${path}`);
  });
  const asset = `${ORIGIN}/assets/current.js`;

  await worker.waitFor("message", { data: { type: "CACHE_URLS", urls: [asset] } });
  await worker.waitFor("message", { data: { type: "CACHE_URLS", version: "2.1.41", urls: [asset] } });
  assert.equal(worker.fetchCalls.length, 0, "missing and stale versions must be ignored");

  await worker.waitFor("message", { data: { type: "CACHE_URLS", version: CURRENT_VERSION, urls: [
    asset,
    asset,
    `${ORIGIN}/assets/bad.js`,
    `${ORIGIN}/assets/private.js`,
    `${ORIGIN}/assets/html.js`,
    `${ORIGIN}/api/nova/status`,
    `${ORIGIN}/history`,
    "https://tile.openstreetmap.org/1/1/1.png",
  ] } });

  assert.deepEqual(worker.fetchCalls.map((call) => new URL(call.url).pathname).sort(), [
    "/assets/bad.js", "/assets/current.js", "/assets/html.js", "/assets/private.js",
  ].sort());
  assert.equal(await (await worker.cached(CURRENT_CACHE, "/assets/current.js"))?.text(), "asset:/assets/current.js");
  assert.equal(await worker.cached(CURRENT_CACHE, "/assets/bad.js"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/assets/private.js"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/assets/html.js"), undefined);
});

test("failed navigation receives the cached app shell", async () => {
  const worker = createWorker(async () => { throw new Error("offline"); });
  await worker.seed(CURRENT_CACHE, "/", ok("<html>offline app</html>", "text/html; charset=utf-8"));

  const responsePromise = worker.dispatchFetch(request("/history", { mode: "navigate" }));
  assert.ok(responsePromise);
  const response = await responsePromise;

  assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), "<html>offline app</html>");
});

test("failed assets and API/provider requests never receive app-shell HTML", async () => {
  const worker = createWorker(async () => { throw new Error("offline"); });
  await worker.seed(CURRENT_CACHE, "/", ok("<html>offline app</html>", "text/html"));
  await worker.seed("shift-tracker-v70", "/assets/previous.js", ok("previous asset"));

  const previousPromise = worker.dispatchFetch(request("/assets/previous.js"));
  assert.ok(previousPromise);
  assert.equal(await (await previousPromise).text(), "previous asset", "the one retained previous cache remains usable during upgrade");

  const missingPromise = worker.dispatchFetch(request("/assets/missing.js"));
  assert.ok(missingPromise);
  const missing = await missingPromise;
  assert.equal(missing.type, "error");
  assert.notEqual(missing.headers.get("Content-Type"), "text/html");

  const apiPromise = worker.dispatchFetch(request("/api/nova/status"));
  assert.ok(apiPromise);
  await assert.rejects(apiPromise, /offline/);

  const providerPromise = worker.dispatchFetch(request("https://tile.openstreetmap.org/1/1/1.png"));
  assert.ok(providerPromise);
  await assert.rejects(providerPromise, /offline/);
});

test("a server 404 for an old hashed asset uses the retained exact asset, never HTML", async () => {
  const worker = createWorker(async () => new Response("missing", { status: 404, headers: { "Content-Type": "text/html" } }));
  await worker.seed(CURRENT_CACHE, "/", ok("<html>new shell</html>", "text/html"));
  await worker.seed("shift-tracker-v70", "/assets/old-hash.js", ok("old working bundle"));

  const responsePromise = worker.dispatchFetch(request("/assets/old-hash.js"));
  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(await response.text(), "old working bundle");
  assert.equal(response.headers.get("Content-Type"), "application/javascript");
});

test("uncached asset requests never receive server HTML fallbacks", async () => {
  for (const status of [200, 404]) {
    const worker = createWorker(async () => new Response("<html>app shell</html>", { status, headers: { "Content-Type": "text/html; charset=utf-8" } }));
    await worker.seed(CURRENT_CACHE, "/", ok("<html>cached shell</html>", "text/html"));

    const responsePromise = worker.dispatchFetch(request(`/assets/missing-${status}.js`));
    assert.ok(responsePromise);
    const response = await responsePromise;
    assert.equal(response.type, "error");
    assert.notEqual(response.headers.get("Content-Type"), "text/html; charset=utf-8");
  }
});

test("runtime caching stores only successful suitable same-origin responses", async () => {
  const worker = createWorker(async (input) => {
    const path = new URL(cacheKey(input)).pathname;
    if (path.endsWith("failed.js")) return new Response("failed", { status: 500 });
    if (path.endsWith("no-store.js")) return new Response("private", { status: 200, headers: { "Cache-Control": "no-store" } });
    return ok(`network:${path}`);
  });

  for (const path of ["/assets/good.js", "/assets/failed.js", "/assets/no-store.js", "/data.json", "/version.json?check=1", "/api/nova/status", "https://tile.openstreetmap.org/1/1/1.png"]) {
    const responsePromise = worker.dispatchFetch(request(path));
    assert.ok(responsePromise);
    await responsePromise;
  }

  assert.equal(await (await worker.cached(CURRENT_CACHE, "/assets/good.js"))?.text(), "network:/assets/good.js");
  assert.equal(await worker.cached(CURRENT_CACHE, "/assets/failed.js"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/assets/no-store.js"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/data.json"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/version.json?check=1"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "/api/nova/status"), undefined);
  assert.equal(await worker.cached(CURRENT_CACHE, "https://tile.openstreetmap.org/1/1/1.png"), undefined);
});

test("a failed core install does not skip waiting or remove the previous app cache", async () => {
  const worker = createWorker(async (input) => {
    const path = new URL(cacheKey(input)).pathname;
    if (path === "/manifest.webmanifest") return new Response("unavailable", { status: 503 });
    return ok(path === "/" ? "<html>new shell</html>" : "core", path === "/" ? "text/html" : "application/octet-stream");
  });
  await worker.seed("shift-tracker-v43", "/", ok("<html>old shell</html>", "text/html"));

  await assert.rejects(worker.waitFor("install"), /not suitable/);

  assert.equal(worker.skips, 0);
  assert.equal(await (await worker.cached("shift-tracker-v43", "/"))?.text(), "<html>old shell</html>");
});

test("install caches lazy modules and dependencies before offline navigation", async () => {
  let offline = false;
  const worker = createWorker(async (input) => {
    if (offline) throw new Error("offline");
    const path = new URL(cacheKey(input)).pathname;
    if (path === "/offline-assets.json") return ok(JSON.stringify({ version: CURRENT_VERSION, urls: ["/assets/map.js", "/assets/reports.js", "/assets/shared.js"] }), "application/json");
    return ok(path === "/" ? "<html>shell</html>" : `module:${path}`, path === "/" ? "text/html" : "application/javascript");
  });
  await worker.waitFor("install");
  assert.equal(worker.skips, 1);
  offline = true;
  assert.equal(await (await worker.dispatchFetch(request("/history", { mode: "navigate" })))?.text(), "<html>shell</html>");
  for (const path of ["/assets/map.js", "/assets/reports.js", "/assets/shared.js"]) {
    assert.equal(await (await worker.dispatchFetch(request(path)))?.text(), `module:${path}`);
  }
});

test("failed lazy asset installation keeps the previous release usable", async () => {
  const worker = createWorker(async (input) => {
    const path = new URL(cacheKey(input)).pathname;
    if (path === "/offline-assets.json") return ok(JSON.stringify({ version: CURRENT_VERSION, urls: ["/assets/map.js"] }), "application/json");
    if (path === "/assets/map.js") return new Response("missing", { status: 404 });
    return ok("shell", path === "/" ? "text/html" : "application/javascript");
  });
  await worker.seed(`shift-tracker-v${currentSequence - 1}`, "/assets/previous.js", ok("previous"));
  await assert.rejects(worker.waitFor("install"));
  assert.equal(worker.skips, 0);
  assert.equal(await (await worker.cached(`shift-tracker-v${currentSequence - 1}`, "/assets/previous.js"))?.text(), "previous");
});

test("install rejects mismatched release manifests and provider URLs", async () => {
  for (const manifest of [
    { version: "wrong-release", urls: ["/assets/report.js"] },
    { version: CURRENT_VERSION, urls: ["https://provider.test/report.js"] },
    { version: CURRENT_VERSION, urls: ["/api/private-data"] },
  ]) {
    const worker = createWorker(async (input) => {
      const path = new URL(cacheKey(input)).pathname;
      return path === "/offline-assets.json" ? ok(JSON.stringify(manifest), "application/json") : ok("shell", path === "/" ? "text/html" : "application/javascript");
    });
    await assert.rejects(worker.waitFor("install"), /manifest version mismatch|Invalid offline asset URL/);
    assert.equal(worker.skips, 0);
    assert.equal(worker.fetchCalls.some(({ url }) => url.includes("provider.test") || url.includes("/api/")), false);
  }
});
