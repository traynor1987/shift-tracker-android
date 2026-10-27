import assert from "node:assert/strict";
import test from "node:test";
import { offlineAssetUrls } from "../scripts/offline-assets.mjs";

test("offline asset generation includes lazy entries, dependencies and CSS once", () => {
  assert.deepEqual(offlineAssetUrls({
    app: { file: "assets/app.js", imports: ["shared"], dynamicImports: ["map", "reports"] },
    map: { file: "assets/map.js", imports: ["shared", "leaflet"], css: ["assets/map.css"] },
    reports: { file: "assets/reports.js", imports: ["shared"] },
    shared: { file: "assets/shared.js" },
    leaflet: { file: "assets/leaflet.js", assets: ["assets/pin.png"] },
  }), ["/assets/app.js", "/assets/leaflet.js", "/assets/map.css", "/assets/map.js", "/assets/pin.png", "/assets/reports.js", "/assets/shared.js"]);
});

test("offline asset generation rejects non-asset and traversal paths", () => {
  for (const file of ["https://provider.test/map.js", "assets/../api/data", "/api/data"]) {
    assert.throws(() => offlineAssetUrls({ bad: { file } }), /Invalid generated asset path/);
  }
});

test("release generator includes manifest-omitted CSS/fonts and Android release lists the offline manifest", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { execFileSync } = await import("node:child_process");
  const fixture = await mkdtemp(join(tmpdir(), "shift-offline-assets-"));
  try {
    const client = join(fixture, "dist/client");
    await mkdir(join(client, ".vite"), { recursive: true });
    await mkdir(join(client, "assets/fonts"), { recursive: true });
    await writeFile(join(client, "version.json"), JSON.stringify({ webAppVersion: "test-release" }));
    await writeFile(join(client, ".vite/manifest.json"), JSON.stringify({ app: { file: "assets/app.js", dynamicImports: ["report"] }, report: { file: "assets/report.js" } }));
    for (const file of ["app.js", "report.js", "shell.css", "fonts/test.woff2"]) await writeFile(join(client, "assets", file), "fixture");
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-offline-assets.mjs", import.meta.url))], { cwd: fixture });
    const offline = JSON.parse(await readFile(join(client, "offline-assets.json"), "utf8"));
    assert.equal(offline.version, "test-release");
    assert.deepEqual(offline.urls, ["/assets/app.js", "/assets/fonts/test.woff2", "/assets/report.js", "/assets/shell.css"]);
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-android-web-release-manifest.mjs", import.meta.url))], { cwd: fixture });
    const android = JSON.parse(await readFile(join(client, "android-web-release.json"), "utf8"));
    assert.ok(android.files.some((file: { path: string }) => file.path === "offline-assets.json"));
    assert.ok(android.files.some((file: { path: string }) => file.path === "assets/report.js"));
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
