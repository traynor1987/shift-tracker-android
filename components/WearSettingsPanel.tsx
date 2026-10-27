"use client";

import { useEffect, useState } from "react";
import { readNativeWearSettings, requestNativeWearSettings, subscribeToNativeMessages, type WearSettingsStatus } from "@/lib/nativeBridge";

const toggles = [
  ["keep_awake", "Keep screen awake"],
  ["battery_saver_display", "Battery saver display"],
  ["show_earnings", "Show earnings on watch"],
  ["haptic_geofence", "Geofence vibration"],
  ["break_alert", "Break target vibration"],
  ["break_ring", "Break progress ring"],
  ["battery_tracking", "Shift battery tracking"],
  ["hold_actions", "Hold to confirm delivery buttons"],
] as const;
const choices = [
  { key: "dim_delay", label: "Dim after", values: [15000, 30000, 60000], suffix: "seconds" },
  { key: "break_minutes", label: "Break target", values: [5, 10, 15, 20, 30, 45, 60], suffix: "minutes" },
  { key: "deliveries", label: "Delivery goal", values: [0, 10, 20, 30, 40, 50], suffix: "deliveries" },
  { key: "hours", label: "Paid hours goal", values: [0, 4, 6, 8, 10, 12], suffix: "hours" },
];

export default function WearSettingsPanel({ native }: { native: boolean }) {
  const [status, setStatus] = useState<WearSettingsStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!native) return;
    const receive = (event: MessageEvent) => {
      const next = readNativeWearSettings(event);
      if (next) { setStatus(next); setWaiting(false); }
    };
    const unsubscribe = subscribeToNativeMessages(receive);
    requestNativeWearSettings("get");
    return unsubscribe;
  }, [native]);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => { setWaiting(false); requestNativeWearSettings("get"); }, 4000);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  const change = (key: string, value: string) => {
    if (requestNativeWearSettings("set", key, value)) setWaiting(true);
  };
  const ready = native && status?.ready === true;
  return <details className="panel wear-settings-panel">
    <summary>
      <span><small>WATCH</small><strong>Wear OS settings</strong><span>Display, vibrations, breaks &amp; goals</span></span>
      <b aria-hidden="true">⌄</b>
    </summary>
    <div className="wear-settings-body">
      <p role="status" className="wear-settings-status">{!native ? "Open this page in the Android app to connect your watch." : !status ? "Update the phone and watch apps to 2.2.60 or later, then open the watch app." : !ready ? "Open the updated watch app once to load its settings." : waiting ? "Saving…" : status.pending ? "Saved on phone · waiting for watch" : "Settings match your watch"}</p>
      {native && <button type="button" className="wear-settings-refresh" onClick={() => { requestNativeWearSettings("get"); }}>Refresh watch settings</button>}
      {ready && <fieldset disabled={waiting}>
        <legend className="sr-only">Watch preferences</legend>
        {toggles.filter(([key]) => key in status.values).map(([key, label]) => <label className="wear-setting-row" key={key}>
          <span>{label}</span><input type="checkbox" role="switch" checked={status.values[key] === "true"} onChange={e => change(key, String(e.target.checked))} />
        </label>)}
        {[
          { key: "main_timer", label: "Main timer", options: [["activity", "Current activity"], ["shift", "Shift elapsed"]] },
          { key: "main_stat", label: "Main screen stat", options: [["deliveries_earnings", "Deliveries + earnings"], ["deliveries", "Deliveries"], ["earnings", "Earnings"], ["mileage", "Mileage"], ["delivery_goal", "Delivery goal"], ["paid_goal", "Paid hours goal"], ["none", "None"]] },
        ].map(({ key, label, options }) => <label className="wear-setting-row" key={key}><span>{label}</span>
          <select value={status.values[key]} onChange={e => change(key, e.target.value)}>
            {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>)}
        {choices.map(({ key, label, values, suffix }) => {
          const current = Number(status.values[key]);
          const options = [...new Set([...values, current])].filter(Number.isFinite).sort((a, b) => a - b);
          return <label className="wear-setting-row" key={key}><span>{label}</span>
            <select value={status.values[key]} onChange={e => change(key, e.target.value)}>
              {options.map(value => <option key={value} value={value}>{value === 0 ? "Off" : `${key === "dim_delay" ? value / 1000 : value} ${suffix}`}</option>)}
            </select>
          </label>;
        })}
        <p className="wear-settings-note">Hold to confirm protects Delivered and Back at Store on watch version 2.2.62 or later. Breaks always show their countdown. Battery reports are in Settings → Shift battery reports on your watch. Changes sync both ways when your phone and watch reconnect. Always-on display and notification or alarm permissions stay in the watch’s system settings.</p>
      </fieldset>}
    </div>
  </details>;
}
