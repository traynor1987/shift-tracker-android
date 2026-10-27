import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initialCssUrls } from "./bundle-css.mjs";
const client = "dist/client/";
const manifest = JSON.parse(readFileSync(`${client}.vite/manifest.json`, "utf8"));
const app = "components/ShiftTrackerApp.tsx";
function staticClosure(key, set) {
  if (set.has(key)) return;
  set.add(key);
  for (const imported of manifest[key]?.imports ?? []) staticClosure(imported, set);
}
const initial = new Set();
staticClosure(app, initial);
const all = new Set(initial), visited = new Set();
function dynamicClosure(key) {
  if (visited.has(key)) return;
  visited.add(key);
  for (const imported of [...manifest[key]?.imports ?? [], ...manifest[key]?.dynamicImports ?? []]) {
    staticClosure(imported, all);
    dynamicClosure(imported);
  }
}
for (const key of initial) dynamicClosure(key);
function measure(keys) {
  const files = [...new Set([...keys].map((key) => manifest[key]?.file).filter(Boolean))];
  return { files, bytes: files.reduce((total, file) => total + statSync(client + file).size, 0), gzip: files.reduce((total, file) => total + gzipSync(readFileSync(client + file)).length, 0) };
}
const main = readFileSync(client + manifest[app].file);
const rscAssets = (await import(pathToFileURL(resolve("dist/server/__vite_rsc_assets_manifest.js")).href)).default;
const cssFiles = initialCssUrls(rscAssets, manifest, initial).map((url) => url.slice(1));
const css = { files: cssFiles, bytes: cssFiles.reduce((total, file) => total + statSync(client + file).size, 0), gzip: cssFiles.reduce((total, file) => total + gzipSync(readFileSync(client + file)).length, 0) };
console.log(JSON.stringify({ css, main: { file: manifest[app].file, bytes: main.length, gzip: gzipSync(main).length }, initial: measure(initial), lazy: measure(new Set([...all].filter((key) => !initial.has(key)))) }, null, 2));
