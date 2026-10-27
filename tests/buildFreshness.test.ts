import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanGeneratedBuild } from "../scripts/clean-generated-build.mjs";

test("build cleanup removes only generated dist including obsolete hashed assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "shift-build-freshness-"));
  try {
    for (const dir of ["dist/client/assets", "dist/server", "public", ".sites-runtime", "data"]) await mkdir(join(root, dir), { recursive: true });
    for (const file of ["dist/client/assets/old.js", "dist/client/assets/old.css", "dist/server/old.js", "public/sw.js", "data/tracker.db", ".sites-runtime/config"]) await writeFile(join(root, file), "preserve");
    await cleanGeneratedBuild(root);
    await assert.rejects(access(join(root, "dist")));
    for (const file of ["public/sw.js", "data/tracker.db", ".sites-runtime/config"]) assert.equal(await readFile(join(root, file), "utf8"), "preserve");
    await cleanGeneratedBuild(root);
    // Simulate the fresh Vite output after cleanup, then build the offline list.
    await mkdir(join(root, "dist/client/assets"), { recursive: true });
    await mkdir(join(root, "dist/client/.vite"), { recursive: true });
    await writeFile(join(root, "dist/client/assets/current.js"), "new");
    await writeFile(join(root, "dist/client/assets/current.css"), "new");
    await writeFile(join(root, "dist/client/version.json"), JSON.stringify({ webAppVersion: "current" }));
    await writeFile(join(root, "dist/client/.vite/manifest.json"), JSON.stringify({ app: { file: "assets/current.js" } }));
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-offline-assets.mjs", import.meta.url))], { cwd: root });
    const offline = JSON.parse(await readFile(join(root, "dist/client/offline-assets.json"), "utf8"));
    assert.deepEqual(offline.urls, ["/assets/current.css", "/assets/current.js"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("verified build cleans before vinext and adds recovery assets without another cleanup", async () => {
  const source = await readFile(new URL("../scripts/build-verified.sh", import.meta.url), "utf8");
  assert.ok(source.indexOf("clean-generated-build.mjs") < source.indexOf('"${vinext}" build'));
  assert.equal((source.match(/clean-generated-build\.mjs/g) ?? []).length, 1);
  assert.ok(source.indexOf("build-task-recovery.mjs") < source.indexOf("build-offline-assets.mjs"));
});

test("initial CSS follows the current RSC shell references rather than stale asset directory entries", async () => {
  const { initialCssUrls } = await import("../scripts/bundle-css.mjs");
  assert.deepEqual(initialCssUrls({ serverResources: { layout: { css: ["/assets/current.css"] } } }, { app: { css: ["assets/component.css"] }, lazy: { css: ["assets/lazy.css"] } }, new Set(["app"])), ["/assets/component.css", "/assets/current.css"]);
});
