// Vite's manifest includes dynamic entries as well as their static dependencies.
export function offlineAssetUrls(manifest) {
  const urls = new Set();
  for (const entry of Object.values(manifest)) {
    for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (typeof file !== "string" || !file.startsWith("assets/") || file.includes("..")) throw new Error("Invalid generated asset path");
      urls.add(`/${file}`);
    }
  }
  return [...urls].sort();
}
