import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { offlineAssetUrls } from "./offline-assets.mjs";
const client = join(process.cwd(), "dist", "client");
async function assetFiles(directory, prefix = "/assets") {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? assetFiles(join(directory, entry.name), `${prefix}/${entry.name}`)
    : entry.isFile() ? [`${prefix}/${entry.name}`] : []))).flat();
}
const manifest = JSON.parse(await readFile(join(client, ".vite", "manifest.json"), "utf8"));
const version = JSON.parse(await readFile(join(client, "version.json"), "utf8")).webAppVersion;
// Vinext can emit CSS/fonts without listing them in Vite's manifest. Include
// the asset directory too so the offline shell is styled on first reopening.
const urls = [...new Set([...offlineAssetUrls(manifest), ...await assetFiles(join(client, "assets"))])].sort();
await writeFile(join(client, "offline-assets.json"), `${JSON.stringify({ version, urls }, null, 2)}\n`);
