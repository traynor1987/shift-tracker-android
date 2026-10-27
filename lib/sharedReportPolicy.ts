export function sharedReportAvailable(status: string, expiresAt: string, now = Date.now()) {
  return status === "active" && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now;
}
