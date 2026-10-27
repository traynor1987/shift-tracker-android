import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WEB_APP_VERSION } from "../lib/nativeBridge.ts";
import { compareWebVersions, newerPublishedVersion, publishedWebVersion } from "../lib/pwaVersion.ts";

test("published web metadata matches the current PWA release", () => {
  const metadata = JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8")) as { webAppVersion: string };
  assert.equal(metadata.webAppVersion, WEB_APP_VERSION);
});

test("calendar-style web version comparison does not use lexicographic ordering", () => {
  assert.equal(compareWebVersions("2.1.44", "2.1.43"), 1);
  assert.equal(compareWebVersions("2.1.44", "2.1.44"), 0);
  assert.equal(compareWebVersions("2.1.9", "2.1.10"), -1);
});

test("published version check bypasses stale caches and detects a newer PWA", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ webAppVersion: "2.1.44" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  assert.equal(await newerPublishedVersion("2.1.43", fetcher), "2.1.44");
  assert.match(requestUrl, /^\/api\/web-version\?check=\d+$/);
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(requestInit?.credentials, "same-origin");
});

test("same, malformed or unavailable version metadata never blocks a valid local import", async () => {
  const same = (async () => new Response(JSON.stringify({ webAppVersion: "2.1.44" }), { status: 200 })) as typeof fetch;
  const malformed = (async () => new Response(JSON.stringify({ webAppVersion: "private-data" }), { status: 200 })) as typeof fetch;
  const unavailable = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.equal(await newerPublishedVersion("2.1.44", same), null);
  assert.equal(await publishedWebVersion(malformed), null);
  assert.equal(await publishedWebVersion(unavailable), null);
});
