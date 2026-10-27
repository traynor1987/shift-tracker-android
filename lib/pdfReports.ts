import type { ActivityRecord, Shift } from "./domain.ts";
import {
  analyseRouteMovement,
  blockedTimeBreakdown,
  blockedTimeReasonLabel,
  deliveryGeofenceDurations,
  deliverySummary,
  formatMoney,
  formatTimingDuration,
  grossWagesPence,
  manualDeliveredCustomerTimings,
  managerRatingLabel,
  paidMilliseconds,
  resolveCustomerLocation,
  stockRunCostPence,
  shiftContextTagLabel,
  shiftOverallRatingLabel,
  taskOutcomeSummary,
  trackedActivityTotals,
  workMilesTenths,
} from "./domain.ts";

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const dateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
  : "Not recorded";
const time = (value: string | null | undefined) => value
  ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  : "—";
const miles = (metres: number) => `${(Math.max(0, metres) / 1609.344).toFixed(2)} mi`;

function reportShell(title: string, subtitle: string, body: string, returnUrl: string) {
  const safeReturnUrl = JSON.stringify(returnUrl).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><style>
  @page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;color:#1b1917;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{min-height:265mm;position:relative}.page-break{break-before:page}.brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e23b45;padding-bottom:12px;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:.16em;font-weight:800;color:#277f94;margin:0 0 4px}.brand h1{font-size:27px;line-height:1.05;margin:0;letter-spacing:-.04em}.brand small{color:#6d6862}.pill{padding:6px 9px;border-radius:999px;background:#e8f2f3;color:#277f94;font-weight:800;font-size:10px;white-space:nowrap}.section{border:1px solid #d9d1c5;border-radius:13px;padding:14px;margin:0 0 13px;background:#fbfaf7}.section h2{font-size:15px;margin:0 0 10px;letter-spacing:-.02em}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stat{padding:10px;border-radius:10px;background:#f0ece3;border:1px solid #e4ddd1;min-height:56px}.stat small{display:block;font-size:8px;letter-spacing:.1em;font-weight:800;color:#746e66;text-transform:uppercase}.stat strong{display:block;font-size:16px;margin-top:4px}.stat em{display:block;color:#746e66;font-size:9px;font-style:normal;margin-top:2px}.map{height:185mm;border-radius:14px;border:1px solid #d5cec2;background:#eef1ed;overflow:hidden}.map.small{height:75mm}.map svg{width:100%;height:100%;display:block}.legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;color:#645f58;font-size:9px}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:9px;height:9px;border-radius:50%;display:inline-block}.timeline{display:grid;gap:7px}.timeline-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #e8e2d9}.timeline-row:last-child{border-bottom:0}.timeline-row strong{display:block}.timeline-row small{display:block;color:#746e66}.timeline-row b{white-space:nowrap}.note{padding:10px 12px;border-left:3px solid #277f94;background:#eef5f5;color:#5d6869}.muted{color:#746e66}.footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #e2dbd1;padding-top:8px;color:#746e66;font-size:9px;display:flex;justify-content:space-between}.empty{padding:24px;text-align:center;color:#746e66}.route-line{fill:none;stroke:#277f94;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.route-line.alt{stroke:#e23b45}.grid-line{stroke:#dce4de;stroke-width:1}.marker{stroke:#fff;stroke-width:3}.marker.start{fill:#277f94}.marker.end{fill:#2d8b68}.marker.customer{fill:#c4871d}.marker-label{font:700 11px Arial;fill:#36322e}.caption{font:700 13px Arial;fill:#615b54}
  .week-overview-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;align-items:start}.print-toolbar{position:sticky;z-index:20;top:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:max(10px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) 14px max(8px,env(safe-area-inset-left));background:#fff}.print-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.print-toolbar button{min-height:44px;border:0;border-radius:9px;padding:10px 15px;background:#277f94;color:#fff;font-weight:800;font-size:12px;cursor:pointer}.print-toolbar button.secondary{background:#f0ece3;color:#403b35;border:1px solid #d9d1c5}.print-toolbar button.back-to-tracker{background:#26221f;color:#fff}.map-tiles{background:#e7eee8}@media print{.no-print{display:none!important}}@media(max-width:700px){.week-overview-grid{grid-template-columns:1fr}.print-toolbar{align-items:stretch}.print-toolbar>button,.print-actions{flex:1 1 100%}.print-actions button{flex:1 1 auto}}
  </style><script>function returnToShiftTracker(){const fallback=${safeReturnUrl};try{const opener=window.opener;if(opener&&!opener.closed&&opener!==window){opener.focus();window.close();window.setTimeout(function(){if(!window.closed)window.location.replace(fallback)},250);return}}catch{}window.location.replace(fallback)}</script></head><body><div class="print-toolbar no-print"><button class="back-to-tracker" type="button" onclick="returnToShiftTracker()">← BACK TO SHIFT TRACKER</button><span class="print-actions"><button type="button" onclick="window.print()">SAVE / OPEN PDF</button><button class="secondary" type="button" onclick="window.print()">PRINT</button></span></div>${body}</body></html>`;
}

function openPrint(title: string, subtitle: string, body: string, reservedPopup?: Window | null) {
  if (typeof window === "undefined") return false;
  const html = reportShell(title, subtitle, body, window.location.href);
  const popup = reservedPopup === undefined ? window.open("", "_blank") : reservedPopup;
  if (!popup) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  let printed = false;
  const printOnce = () => { if (printed) return; printed = true; try { popup?.focus(); popup?.print(); } catch { /* use visible button */ } };
  popup.addEventListener("load", printOnce, { once: true });
  window.setTimeout(printOnce, 900);
  return true;
}

function pointsFor(activity: ActivityRecord) {
  return (activity.routeEvidence?.points ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function routeSvg(activities: ActivityRecord[], height = 600) {
  const points = activities.flatMap(pointsFor);
  if (!points.length) return `<div class="empty">No GPS route was recorded for this report.</div>`;
  const minLng = Math.min(...points.map((p) => p.longitude)); const maxLng = Math.max(...points.map((p) => p.longitude));
  const lngSpan = Math.max(.0001, maxLng - minLng);
  const zoom = Math.max(3, Math.min(17, Math.floor(Math.log2(700 / (lngSpan * 256 / 360)))));
  const world = (lat: number, lng: number) => {
    const scale = 256 * 2 ** zoom;
    const x = (lng + 180) / 360 * scale;
    const sin = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return { x, y };
  };
  const worldPoints = points.map((p) => world(p.latitude, p.longitude));
  const wx = worldPoints.map((p) => p.x); const wy = worldPoints.map((p) => p.y);
  const ox = (Math.min(...wx) + Math.max(...wx)) / 2 - 360;
  const oy = (Math.min(...wy) + Math.max(...wy)) / 2 - (height - 80) / 2;
  const project = (lat: number, lng: number) => { const p = world(lat, lng); return `${(p.x - ox).toFixed(1)},${(p.y - oy).toFixed(1)}`; };
  const tileSize = 256;
  const tileMinX = Math.floor(Math.min(...wx) / tileSize); const tileMaxX = Math.floor(Math.max(...wx) / tileSize);
  const tileMinY = Math.floor(Math.min(...wy) / tileSize); const tileMaxY = Math.floor(Math.max(...wy) / tileSize);
  const tiles = [];
  for (let tx = tileMinX; tx <= tileMaxX; tx += 1) for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    const x = ((tx % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
    tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${x}/${ty}.png" x="${tx * tileSize - ox}" y="${ty * tileSize - oy}" width="256" height="256" preserveAspectRatio="none"/>`);
  }
  const polylines = activities.map((activity, index) => {
    const path = pointsFor(activity).map((p) => project(p.latitude, p.longitude)).join(" ");
    return path ? `<polyline class="route-line${index % 2 ? " alt" : ""}" points="${path}"/>` : "";
  }).join("");
  const first = points[0]; const last = points.at(-1)!;
  const customers = activities.flatMap((activity) => {
    const location = resolveCustomerLocation(activity);
    return location ? [`<circle class="marker customer" cx="${project(location.latitude, location.longitude).split(",")[0]}" cy="${project(location.latitude, location.longitude).split(",")[1]}" r="8"/>`] : [];
  }).join("");
  const start = project(first.latitude, first.longitude).split(","); const end = project(last.latitude, last.longitude).split(",");
  return `<svg class="map-tiles" viewBox="0 0 800 ${height}" role="img" aria-label="OpenStreetMap road map with recorded GPS route"><rect width="800" height="${height}" fill="#e7eee8"/>${tiles.join("")}<rect width="800" height="${height}" fill="#ffffff" opacity=".08"/>${polylines}${customers}<circle class="marker start" cx="${start[0]}" cy="${start[1]}" r="9"/><text class="marker-label" x="${Number(start[0]) + 13}" y="${Number(start[1]) + 4}">Store / start</text><circle class="marker end" cx="${end[0]}" cy="${end[1]}" r="9"/><text class="marker-label" x="${Number(end[0]) + 13}" y="${Number(end[1]) + 4}">Store / return</text><text class="caption" x="30" y="${height - 12}">OpenStreetMap · recorded GPS route</text></svg>`;
}

function activityStats(activity: ActivityRecord) {
  const route = activity.routeEvidence;
  const timing = deliveryGeofenceDurations(activity);
  const movement = analyseRouteMovement(activity);
  const customer = resolveCustomerLocation(activity);
  const customerTimings = manualDeliveredCustomerTimings(activity);
  const total = timing.totalMs ?? (route?.completedAt ? new Date(route.completedAt).getTime() - new Date(activity.start).getTime() : 0);
  const rows = [
    ["Total delivery", formatTimingDuration(total), `${time(activity.start)}–${time(activity.backAtStoreAt ?? activity.end)}`],
    ["Leave store", timing.preDepartureMs != null ? formatTimingDuration(timing.preDepartureMs) : "Not recorded", "Start → geofence exit"],
    ["Outside / hustle", timing.hustleMs != null ? formatTimingDuration(timing.hustleMs) : "Not recorded", "Geofence exit → entry"],
    ["Enter store → button", timing.returnDelayMs != null ? formatTimingDuration(timing.returnDelayMs) : "Not recorded", "Entry → Back at Store"],
    ["Customer point", customer ? customer.source === "manual_delivered" ? "Manual GPS" : "GPS-derived" : "Not recorded", customer ? `±${Math.round(customer.accuracy ?? 0)}m` : "No customer point"],
    ...customerTimings.map((timing, index) => [`Customer ${timing.customerIndex ?? index + 1} to house`, timing.durationMs != null ? formatTimingDuration(timing.durationMs) : "Not recorded", `Delivered tap · ${time(timing.timestamp)}`]),
    ["Moving time", formatTimingDuration(movement.totals?.free?.ms + movement.totals?.moderate?.ms + movement.totals?.slow?.ms + movement.totals?.heavy?.ms || 0), "Recorded movement"],
    ["Stationary / slow", formatTimingDuration(movement.totals?.stationary?.ms || 0), "GPS-derived movement"],
    ["GPS distance", route ? miles(route.distanceMetres) : "Not recorded", route ? `${route.recordedPointCount} samples` : ""],
  ];
  return rows;
}

function activityBlock(activity: ActivityRecord) {
  if (activity.badDelivery) return `<section class="section"><h2>Bad delivery</h2><p>Delivery count and reimbursement retained. GPS and Hustle statistics excluded by the owner.</p></section>`;
  const route = activity.routeEvidence;
  const title = activity.type === "double_delivery" ? "Double delivery" : "Single delivery";
  const rows = activityStats(activity);
  return `<section class="section"><h2>${esc(title)} · ${esc(dateTime(activity.start))}</h2><div class="stats">${rows.map(([label, value, note]) => `<div class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join("")}</div></section>${route ? `<section class="section"><h2>Recorded route</h2><div class="map small">${routeSvg([activity], 420)}</div><div class="legend"><span><i style="background:#277f94"></i>Recorded GPS route</span><span><i style="background:#c4871d"></i>Customer point where available</span><span><i style="background:#2d8b68"></i>Store return</span></div></section>` : ""}`;
}

export function printDeliveryReport(activity: ActivityRecord, popup?: Window | null) {
  const title = `${activity.type === "double_delivery" ? "Double" : "Single"} delivery report`;
  const route = activity.routeEvidence;
  const usableRoute = Boolean(route && route.status !== "expired" && route.points.length >= 2);
  const unavailableMessage = route?.status === "expired" ? `Detailed GPS route expired after ${route.recordedPointCount} recorded points. Delivery timings remain saved.` : route?.recordedPointCount ? `Partial GPS record: ${route.recordedPointCount} point${route.recordedPointCount === 1 ? "" : "s"}. No reliable route map is available.` : "No recorded GPS route available. Delivery timings remain saved.";
  const body = `<div class="page"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · DELIVERY REPORT</p><h1>${esc(title)}</h1><small>${esc(dateTime(activity.start))}</small></div><span class="pill">LOCAL GPS EVIDENCE</span></div><section class="section"><h2>Recorded route</h2><div class="map">${usableRoute ? routeSvg([activity], 820) : `<div class="empty">${esc(unavailableMessage)}</div>`}</div>${usableRoute ? `<div class="legend"><span><i style="background:#277f94"></i>Recorded GPS route</span><span><i style="background:#c4871d"></i>Customer point where available</span><span><i style="background:#2d8b68"></i>Store return</span></div>` : ""}</section><div class="footer"><span>Route evidence is derived from saved device GPS.</span><span>Page 1 · route evidence</span></div></div><div class="page page-break"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · DELIVERY REPORT</p><h1>Delivery statistics</h1><small>${esc(dateTime(activity.start))}</small></div><span class="pill">${esc(title.toUpperCase())}</span></div>${activityBlock(activity).replace(/<section class="section"><h2>Recorded route<\/h2>[\s\S]*<\/section>$/, "")}<div class="note">This report describes the recorded journey and GPS-derived timings. It does not claim why a delay occurred unless the evidence explicitly supports that context.</div><div class="footer"><span>Local evidence only · no customer names or addresses.</span><span>Page 2 · statistics</span></div></div>`;
  return openPrint(title, dateTime(activity.start), body, popup);
}

/** A stock run uses the same local journey evidence as a delivery, but its
 * report is deliberately cost-focused: there is no delivery reimbursement. */
export function printStockRunReport(
  activity: ActivityRecord,
  hourlyRatePence: number,
  fuelCostPencePerMile: number,
  popup?: Window | null,
) {
  const title = "Stock run cost report";
  const route = activity.routeEvidence;
  const usableRoute = Boolean(route && route.status !== "expired" && route.points.length >= 2);
  const unavailableMessage = route?.status === "expired" ? `Detailed GPS route expired after ${route.recordedPointCount} recorded points. Timing and cost figures remain saved.` : route?.recordedPointCount ? `Partial GPS record: ${route.recordedPointCount} point${route.recordedPointCount === 1 ? "" : "s"}. No reliable route map is available.` : "No recorded GPS route available. Timing and cost figures remain saved.";
  const cost = stockRunCostPence(activity, hourlyRatePence, fuelCostPencePerMile);
  const durationMs = Math.max(0, new Date(activity.end ?? activity.start).getTime() - new Date(activity.start).getTime());
  const body = `<div class="page"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · STOCK RUN</p><h1>${esc(title)}</h1><small>${esc(dateTime(activity.start))}</small></div><span class="pill">UNREIMBURSED JOURNEY</span></div><section class="section"><h2>Recorded route</h2><div class="map">${usableRoute ? routeSvg([activity], 820) : `<div class="empty">${esc(unavailableMessage)}</div>`}</div>${usableRoute ? `<div class="legend"><span><i style="background:#277f94"></i>Recorded GPS route</span><span><i style="background:#2d8b68"></i>Store return</span></div>` : ""}</section><div class="footer"><span>Route evidence is derived from saved device GPS.</span><span>Page 1 · route evidence</span></div></div><div class="page page-break"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · STOCK RUN</p><h1>Cost breakdown</h1><small>${esc(dateTime(activity.start))}</small></div><span class="pill">NO DELIVERY PAY</span></div><section class="section"><h2>Saved run totals</h2><div class="stats"><div class="stat"><small>Journey time</small><strong>${esc(formatTimingDuration(durationMs))}</strong><em>${esc(time(activity.start))}–${esc(time(activity.end))}</em></div><div class="stat"><small>GPS miles</small><strong>${esc(cost.routeMiles.toFixed(2))} mi</strong><em>${route?.recordedPointCount ?? 0} saved GPS points</em></div><div class="stat"><small>Paid time cost</small><strong>${esc(formatMoney(cost.wagePence))}</strong><em>Time paid by the store</em></div><div class="stat"><small>Your fuel cost</small><strong>${esc(formatMoney(cost.fuelPence))}</strong><em>Unreimbursed estimate</em></div><div class="stat"><small>Total work cost</small><strong>${esc(formatMoney(cost.totalPence))}</strong><em>Paid time + your fuel</em></div><div class="stat"><small>Net after fuel</small><strong>${esc(formatMoney(cost.netPence))}</strong><em>Paid time less fuel estimate</em></div></div></section><div class="note">This is a cost record for a work journey. It does not add delivery reimbursement or count as a customer delivery.</div><div class="footer"><span>Local evidence only · generated from saved Shift Tracker data.</span><span>Page 2 · costs</span></div></div>`;
  return openPrint(title, dateTime(activity.start), body, popup);
}

export function buildShiftReportBody(shift: Shift) {
  const deliveries = (shift.activities ?? []).filter((activity) => !activity.testOnly && !activity.badDelivery && (activity.type === "single_delivery" || activity.type === "double_delivery") && activity.end);
  const totals = trackedActivityTotals(shift);
  const blocked = blockedTimeBreakdown(shift);
  const taskOutcomes = taskOutcomeSummary(shift);
  const delivery = deliverySummary(shift);
  const deliveryDurations = deliveries.map((activity) => deliveryGeofenceDurations(activity).totalMs).filter((value): value is number => value != null);
  const customerDurations = deliveries.flatMap(manualDeliveredCustomerTimings).map((timing) => timing.durationMs).filter((value): value is number => value != null);
  const averageDelivery = deliveryDurations.length ? formatTimingDuration(deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length) : "Not tracked";
  const averageToCustomer = customerDurations.length ? formatTimingDuration(customerDurations.reduce((sum, value) => sum + value, 0) / customerDurations.length) : "Tap Delivered";
  const blockedSection = blocked.length ? `<section class="section"><h2>Blocked time</h2><div class="timeline">${blocked.map((item) => `<div class="timeline-row"><span><strong>${esc(blockedTimeReasonLabel(item.reason, "professional"))}</strong></span><b>${esc(formatTimingDuration(item.durationMs))}</b></div>`).join("")}</div></section>` : "";
  const taskOutcomeSection = taskOutcomes.total ? `<section class="section"><h2>Task outcomes</h2><div class="stats"><div class="stat"><small>Completed</small><strong>${taskOutcomes.completed}</strong></div><div class="stat"><small>Management blocked</small><strong>${taskOutcomes.managementBlocked}</strong><em>Not counted as missed</em></div><div class="stat"><small>Missed</small><strong>${taskOutcomes.missed}</strong></div></div></section>` : "";
  const ratingSection = shift.ratingReview ? `<section class="section"><h2>Shift review</h2><div class="stats"><div class="stat"><small>Overall shift</small><strong>${esc(shiftOverallRatingLabel(shift.ratingReview.overallRating, "professional"))}</strong></div><div class="stat"><small>Management</small><strong>${esc(managerRatingLabel(shift.ratingReview.managerRating, "professional"))}</strong>${shift.context?.managerOnDuty ? `<em>${esc(shift.context.managerOnDuty)}</em>` : ""}</div></div>${shift.context?.tags.length ? `<div class="note">Context: ${esc(shift.context.tags.map(shiftContextTagLabel).join(" · "))}</div>` : ""}</section>` : "";
  return `<div class="page"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · DAY REPORT</p><h1>Shift report</h1><small>${esc(dateTime(shift.clockIn))} · ${esc(shift.clockOut ? dateTime(shift.clockOut) : "Open shift")}</small></div><span class="pill">${delivery.runs} RUNS</span></div><section class="section"><h2>Recorded routes</h2><div class="map">${routeSvg(deliveries, 820)}</div><div class="legend"><span><i style="background:#277f94"></i>Recorded GPS route</span><span><i style="background:#e23b45"></i>Additional route</span><span><i style="background:#c4871d"></i>Customer point</span></div></section><div class="footer"><span>Local evidence only · no customer names or addresses.</span><span>Page 1 · route map</span></div></div><div class="page page-break"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · DAY REPORT</p><h1>Shift statistics</h1><small>${esc(dateTime(shift.clockIn))}</small></div><span class="pill">SUMMARY</span></div><section class="section"><h2>Shift totals</h2><div class="stats"><div class="stat"><small>Paid time</small><strong>${esc(formatTimingDuration(paidMilliseconds(shift)))}</strong><em>After recorded breaks</em></div><div class="stat"><small>Deliveries</small><strong>${delivery.individual}</strong><em>${delivery.runs} runs</em></div><div class="stat"><small>Wages</small><strong>${esc(formatMoney(grossWagesPence(shift)))}</strong><em>Estimated gross</em></div><div class="stat"><small>Tracked delivery</small><strong>${esc(formatTimingDuration(totals.deliveryMs))}</strong><em>Saved timers</em></div><div class="stat"><small>Average delivery time</small><strong>${esc(averageDelivery)}</strong><em>Complete saved timer per run</em></div><div class="stat"><small>Average to customer</small><strong>${esc(averageToCustomer)}</strong><em>Explicit Delivered taps only</em></div><div class="stat"><small>Cleaning</small><strong>${esc(formatTimingDuration(totals.cleaningMs))}</strong><em>Tracked cleaning</em></div><div class="stat"><small>Blocked time</small><strong>${esc(formatTimingDuration(totals.blockedMs))}</strong><em>Paid · management prevented work</em></div><div class="stat"><small>Work miles</small><strong>${workMilesTenths(shift) == null ? "Not entered" : (workMilesTenths(shift)! / 10).toFixed(1)}</strong><em>Manual mileage</em></div></div></section>${ratingSection}${taskOutcomeSection}${blockedSection}<section class="section"><h2>Delivery breakdown</h2><div class="timeline">${deliveries.length ? deliveries.map((activity, index) => { const timing = deliveryGeofenceDurations(activity, "real"); return `<div class="timeline-row"><span><strong>${index + 1}. ${activity.type === "double_delivery" ? "Double" : "Single"} delivery</strong><small>${time(activity.start)}–${time(activity.end)} · ${miles(activity.routeEvidence?.distanceMetres ?? 0)} recorded</small></span><b>${timing.totalMs != null ? formatTimingDuration(timing.totalMs) : "Not tracked"}</b></div>`; }).join("") : `<div class="empty">No completed deliveries were recorded.</div>`}</div></section><div class="note">This report uses the original locally saved shift timings, mileage and GPS route evidence. It does not alter the tracker data.</div><div class="footer"><span>Local evidence only · no customer names or addresses.</span><span>Page 2 · statistics</span></div></div>`;
}

export function printShiftReport(shift: Shift, popup?: Window | null) {
  return openPrint("Shift day report", dateTime(shift.clockIn), buildShiftReportBody(shift), popup);
}

export function printWeekReport(shifts: Shift[], weekStart: Date, popup?: Window | null) {
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const inWeek = shifts.filter((shift) => { const stamp = new Date(shift.clockIn).getTime(); return stamp >= weekStart.getTime() && stamp <= weekEnd.getTime(); });
  const deliveries = inWeek.flatMap((shift) => (shift.activities ?? []).filter((activity) => !activity.testOnly && !activity.badDelivery && (activity.type === "single_delivery" || activity.type === "double_delivery") && activity.end));
  const paid = inWeek.reduce((sum, shift) => sum + paidMilliseconds(shift), 0); const wages = inWeek.reduce((sum, shift) => sum + grossWagesPence(shift), 0); const mileage = inWeek.reduce((sum, shift) => sum + (workMilesTenths(shift) ?? 0), 0);
  const body = `<div class="page"><div class="brand"><div><p class="eyebrow">SHIFT TRACKER · WEEKLY SUMMARY</p><h1>Week report</h1><small>${esc(weekStart.toLocaleDateString("en-GB"))} – ${esc(weekEnd.toLocaleDateString("en-GB"))}</small></div><span class="pill">${inWeek.length} SHIFTS</span></div><div class="week-overview-grid"><section class="section"><h2>Route overview</h2><div class="map small">${routeSvg(deliveries, 430)}</div><div class="legend"><span><i style="background:#277f94"></i>Recorded GPS routes</span><span><i style="background:#c4871d"></i>Customer points</span></div></section><section class="section"><h2>Weekly totals</h2><div class="stats"><div class="stat"><small>Paid time</small><strong>${esc(formatTimingDuration(paid))}</strong></div><div class="stat"><small>Deliveries</small><strong>${inWeek.reduce((sum, shift) => sum + deliverySummary(shift).runs, 0)}</strong><em>${inWeek.reduce((sum, shift) => sum + deliverySummary(shift).individual, 0)} individual</em></div><div class="stat"><small>Estimated wages</small><strong>${esc(formatMoney(wages))}</strong></div><div class="stat"><small>Work miles</small><strong>${(mileage / 10).toFixed(1)}</strong><em>Recorded/manual miles</em></div><div class="stat"><small>GPS routes</small><strong>${deliveries.filter((activity) => (activity.routeEvidence?.points.length ?? 0) >= 2).length}</strong></div><div class="stat"><small>Average trip</small><strong>${deliveries.length ? formatTimingDuration(deliveries.reduce((sum, activity) => sum + (deliveryGeofenceDurations(activity).totalMs ?? 0), 0) / deliveries.length) : "Not tracked"}</strong></div></div></section></div><div class="section"><h2>Shift summary</h2><div class="timeline">${inWeek.length ? inWeek.map((shift) => { const count = deliverySummary(shift); return `<div class="timeline-row"><span><strong>${esc(new Date(shift.clockIn).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }))}</strong><small>${time(shift.clockIn)}–${time(shift.clockOut)} · ${count.runs} runs · ${count.individual} deliveries</small></span><b>${esc(formatTimingDuration(paidMilliseconds(shift)))}</b></div>`; }).join("") : `<div class="empty">No shifts recorded in this week.</div>`}</div></div><div class="footer"><span>Local evidence only · generated from saved Shift Tracker data.</span><span>Weekly summary</span></div></div>`;
  return openPrint("Shift weekly report", `${weekStart.toLocaleDateString("en-GB")} – ${weekEnd.toLocaleDateString("en-GB")}`, body, popup);
}
