// RSC server resources are the styles the current shell actually links. The
// directory may contain obsolete hashes and must not define initial transfer.
export function initialCssUrls(rscAssets, viteManifest, initialKeys) {
  const urls = new Set(Object.values(rscAssets.serverResources ?? {}).flatMap((entry) => entry.css ?? []));
  for (const key of initialKeys) for (const file of viteManifest[key]?.css ?? []) urls.add(`/${file}`);
  for (const url of urls) if (!url.startsWith("/assets/") || url.includes("..")) throw new Error("Invalid generated CSS path");
  return [...urls].sort();
}
