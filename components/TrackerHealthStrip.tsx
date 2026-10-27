"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NativeShellInfo } from "../lib/nativeBridge";
import { WEB_APP_VERSION } from "../lib/nativeBridge";
import { localSaveSnapshot } from "../lib/localSaveStatus";
import { diagnosticExport, type TrackingHealth } from "../lib/trackerHealth";
import type { ActivityRecord } from "../lib/domain";
import { hostedBackupDiagnostics, readHostedCapability } from "../lib/hostedBackup";
import { phase3ReturnStatus } from "../lib/phase3Status";
import PresentationDisclosure from "./PresentationDisclosure";
import Phase3OperationalStatus from "./Phase3OperationalStatus";
import { saveExportFile } from "../lib/storage";

export function DiagnosticExportButton({ native, tracking }: { native: NativeShellInfo | null; tracking?: TrackingHealth }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const exportHealth = async () => {
    setBusy(true);
    try {
      const result = await saveExportFile(`shift-tracker-diagnostics-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.json`, diagnosticExport({ webVersion: WEB_APP_VERSION, native, tracking }), "application/json");
      setMessage(result.status === "saved" ? "Diagnostics exported" : result.status === "cancelled" ? "Export cancelled" : "Export failed. Try again.");
    } catch { setMessage("Export failed. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="diagnostic-export-control"><button type="button" disabled={busy} onClick={() => void exportHealth()}>{busy ? "Exporting…" : "Export diagnostics"}</button>{message && <small role="status">{message}</small>}</div>;
}

const cloudSnapshot = () => ({ ...hostedBackupDiagnostics(), enabled: readHostedCapability()?.backupEnabled === true });

export default function TrackerHealthStrip({ tracking, native, onSetupLocation, legacy = true, familiar = false, compact = false, activity }: { tracking: TrackingHealth; native: NativeShellInfo | null; onSetupLocation: () => void; legacy?: boolean; familiar?: boolean; compact?: boolean; activity?: ActivityRecord | null }) {
  const [save, setSave] = useState(localSaveSnapshot);
  const [cloud, setCloud] = useState(cloudSnapshot);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Poll this small leaf component, rather than rerendering the full app for
    // both ends of each GPS save. Resume refresh is immediate.
    const refresh = () => { setSave(localSaveSnapshot()); setCloud(previous => { const next = cloudSnapshot(); return JSON.stringify(previous) === JSON.stringify(next) ? previous : next; }); };
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, []);
  const returned = familiar ? phase3ReturnStatus(activity) : null;
  const saveLabel = save.status === "failed" ? "Save needs attention" : save.status === "saving" ? "Saving locally…" : save.status === "saved" ? "Saved locally" : "Local data loaded";
  return <>
    {!familiar && <PresentationDisclosure legacy={legacy} title="Backup & return"><Phase3OperationalStatus legacy={legacy} save={save} cloud={cloud} nativeActive={native?.trackingActive === true} activity={activity} /></PresentationDisclosure>}
    <button type="button" className="tracker-health-strip" aria-label={`${tracking.label}. ${saveLabel}. View tracking and save details`} onClick={() => setOpen(true)}>
      <span className={tracking.tone}><i aria-hidden="true" />{tracking.label}</span>
      <span className={save.status === "failed" ? "warning" : "quiet"}>{saveLabel}</span>
    </button>
    {returned && <small className="familiar-return-note" aria-label={`${returned.label}. ${returned.operational}. ${returned.exact}`}>{compact ? `${returned.label}${returned.exact.includes("GPS gap") ? " · GPS gap" : ""}` : `${returned.label} · ${returned.exact}`}</small>}
    {open && createPortal(<div className="modal-backdrop" role="presentation"><section className="confirm-modal tracker-health-modal" role="dialog" aria-modal="true" aria-labelledby="tracker-health-title">
      {familiar && <Phase3OperationalStatus legacy={false} save={save} cloud={cloud} nativeActive={native?.trackingActive === true} activity={activity} />}
      <p className="eyebrow">TRACKING &amp; SAVING</p><h2 id="tracker-health-title">Tracker status</h2>
      <dl><dt>GPS</dt><dd>{tracking.label}{tracking.ageSeconds != null ? ` · last fix ${tracking.ageSeconds}s ago` : ""}</dd><dt>Local records</dt><dd>{saveLabel}</dd><dt>Last successful save</dt><dd>{save.savedAt ? new Date(save.savedAt).toLocaleTimeString("en-GB") : "No new saves this session"}</dd></dl>
      {tracking.label === "GPS setup needed" && <><p>Delivery location setup needs your confirmation inside Shift Tracker. Your phone’s location permission is separate.</p><button type="button" onClick={() => { setOpen(false); onSetupLocation(); }}>Set up GPS</button></>}
      <p>GPS fixes and store-return confirmation are separate. A delayed fix cannot prove a crossing. Local saving works without an internet connection.</p>
      <p>Diagnostics include versions, GPS health and save timings. They exclude routes, customer details and keys.</p>
      <DiagnosticExportButton native={native} tracking={tracking} />
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </section></div>, document.body)}
  </>;
}
