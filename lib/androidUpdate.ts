export type AndroidStableManifest = {
  version: string;
  versionCode?: number;
  releasedAt: string;
  minimumWebDataVersion: number;
  maximumWebDataVersion: number;
  releaseNotes: string[];
  downloadUrl?: string;
  apkSha256?: string;
  signingCertificateSha256?: string;
};

export function compareVersions(left: string, right: string) {
  const parts = (value: string) => value.split(".").map((item) => Number.parseInt(item, 10) || 0);
  const a = parts(left); const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) { const difference = (a[index] ?? 0) - (b[index] ?? 0); if (difference) return difference > 0 ? 1 : -1; }
  return 0;
}

export function assessAndroidUpdate(installedVersion: string | null, dataVersion: number, manifest: AndroidStableManifest) {
  const compatible = dataVersion >= manifest.minimumWebDataVersion && dataVersion <= manifest.maximumWebDataVersion;
  const comparison = installedVersion ? compareVersions(manifest.version, installedVersion) : null;
  const available = comparison === 1;
  const current = comparison === 0;
  const installedAhead = comparison === -1;
  const signatureEstablished = Boolean(manifest.signingCertificateSha256 && /^[a-f0-9]{64}$/i.test(manifest.signingCertificateSha256));
  const artifactEstablished = Boolean(manifest.downloadUrl?.startsWith("https://") && manifest.apkSha256 && /^[a-f0-9]{64}$/i.test(manifest.apkSha256));
  return { available, current, installedAhead, compatible, signatureEstablished, artifactEstablished, safeToOffer: available && compatible && signatureEstablished && artifactEstablished };
}
