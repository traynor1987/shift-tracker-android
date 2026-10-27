import type { NativeWearUpdateMessage } from "./nativeBridge.ts";

export type WearUpdatePresentation = {
  label: string;
  latestVersion: string | null;
  canSend: boolean;
  isBusy: boolean;
};

/** Pure, conservative presentation mapping for Android-owned Wear updates. */
export function presentWearUpdate(status: NativeWearUpdateMessage | null, installedVersion: string | null, connected: boolean | null): WearUpdatePresentation {
  const state = status?.state;
  const latestVersion = status?.latestVersion ?? null;
  if (state === "available") return { label: "UPDATE AVAILABLE", latestVersion, canSend: true, isBusy: false };
  if (state === "up_to_date") return { label: "UP TO DATE", latestVersion: latestVersion ?? installedVersion, canSend: false, isBusy: false };
  if (state === "watch_not_connected" || connected === false) return { label: "WATCH NOT CONNECTED", latestVersion, canSend: false, isBusy: false };
  if (state === "watch_version_unknown") return { label: "INSTALLED VERSION UNAVAILABLE", latestVersion, canSend: false, isBusy: false };
  if (state === "checking") return { label: "CHECKING…", latestVersion, canSend: false, isBusy: true };
  if (state === "downloading") return { label: "DOWNLOADING", latestVersion, canSend: false, isBusy: true };
  if (state === "verified") return { label: "VERIFYING", latestVersion, canSend: false, isBusy: true };
  if (state === "sent_to_watch") return { label: "WAITING FOR INSTALL", latestVersion, canSend: false, isBusy: false };
  if (state === "receiving") return { label: "SENDING TO WATCH", latestVersion, canSend: false, isBusy: true };
  if (state === "ready_to_install" || state === "installer_opened") return { label: "READY TO INSTALL", latestVersion, canSend: false, isBusy: false };
  if (state === "install_permission_required") return { label: "WATCH CONFIRMATION REQUIRED", latestVersion, canSend: false, isBusy: false };
  if (state === "unavailable" || state === "failed") return { label: "STATUS UNAVAILABLE", latestVersion, canSend: false, isBusy: false };
  return { label: "CHECK FOR UPDATES", latestVersion, canSend: false, isBusy: false };
}
