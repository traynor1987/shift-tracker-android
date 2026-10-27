export function compareWebVersions(left: string, right: string) {
  const parts = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export async function publishedWebVersion(fetcher: typeof fetch = fetch) {
  try {
    // Android serves its verified offline bundle at /version.json, even with a
    // cache-busting query. Use a dynamic route so an in-app check reaches the
    // published release instead of reporting the shell's local version.
    const response = await fetcher(`/api/web-version?check=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const parsed = await response.json() as { webAppVersion?: unknown };
    return typeof parsed.webAppVersion === "string" && /^\d+(?:\.\d+){1,3}$/.test(parsed.webAppVersion) ? parsed.webAppVersion : null;
  } catch {
    return null;
  }
}

export async function newerPublishedVersion(current: string, fetcher: typeof fetch = fetch) {
  const published = await publishedWebVersion(fetcher);
  return published && compareWebVersions(published, current) > 0 ? published : null;
}
