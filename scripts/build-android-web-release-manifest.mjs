import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const client = join(process.cwd(), "dist", "client");
const version = JSON.parse(await readFile(join(client, "version.json"), "utf8")).webAppVersion;
const ignored = new Set(["android-web-release.json", ".assetsignore"]);
const mime = (path) => path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".json") || path.endsWith(".webmanifest") ? "application/json" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    if (!entry.isFile()) return [];
    const path = relative(client, absolute).split(sep).join("/");
    if (ignored.has(path) || path.startsWith(".vite/")) return [];
    const bytes = await readFile(absolute);
    return [{ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: (await stat(absolute)).size, mimeType: mime(path) }];
  }))).flat();
}
const files = (await walk(client)).sort((a, b) => a.path.localeCompare(b.path));
await writeFile(join(client, "android-web-release.json"), `${JSON.stringify({ webAppVersion: version, files }, null, 2)}\n`);
