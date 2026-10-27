/**
 * The application circuit breaker is deliberately independent from Google
 * billing, quotas and pricing. Change only in source code after an intentional
 * review; normal app settings can never override these figures.
 */
export const GOOGLE_ROUTES_30_DAY_HARD_LIMIT = 3_000;
export const GOOGLE_ROUTES_24_HOUR_HARD_LIMIT = 150;
export const GOOGLE_ROUTES_PER_DELIVERY_HARD_LIMIT = 2;
/** A confirmed one-off refresh may add one outbound + one return call only. */
export const GOOGLE_ROUTES_PER_DELIVERY_OVERRIDE_HARD_LIMIT = 2;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const LEDGER_KEY = "shift-tracker-google-routes-ledger-v1";
const CACHE_KEY = "shift-tracker-google-routes-cache-v1";
const CLOCK_KEY = "shift-tracker-google-routes-clock-v1";
const API_KEY_STORAGE = "shift-tracker-google-routes-api-key-v1";
const LOCK_KEY = "shift-tracker-google-routes-reservation-lock-v1";

export type GoogleRoutesBlockReason = "GOOGLE_API_HARD_LIMIT_REACHED" | "GOOGLE_API_DAILY_LIMIT_REACHED" | "DELIVERY_GOOGLE_API_LIMIT_REACHED" | "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED" | "GOOGLE_API_CLOCK_SAFETY_BLOCKED" | "GOOGLE_API_NOT_CONFIGURED" | "GOOGLE_API_UNAVAILABLE" | "GOOGLE_API_LIVE_DELIVERY_ONLY" | "GOOGLE_API_REQUEST_REJECTED" | "GOOGLE_API_KEY_REJECTED" | "GOOGLE_API_PROVIDER_RATE_LIMITED" | "GOOGLE_API_NO_USABLE_ROUTE";
export type GoogleRoutesAuditCode = GoogleRoutesBlockReason | "CACHE_HIT" | "NETWORK_REQUEST" | "GOOGLE_API_ROUTE_COMPLETED" | "GOOGLE_API_INCOMPLETE";
export type GoogleRoutesDetailCode = "NETWORK_STARTED" | "CACHE_SERVED" | "BLOCKED_BEFORE_NETWORK" | "FETCH_UNAVAILABLE" | "FETCH_EXCEPTION" | "HTTP_ERROR" | "INVALID_JSON" | "NO_ROUTE_DATA" | "ROUTE_RESULT_SAVED" | "MAPS_JS_LOAD_FAILED" | "MAPS_JS_LIBRARY_FAILED" | "MAPS_JS_REFRESH_REQUIRED" | "MAPS_ROUTE_EXCEPTION" | "LEGACY_UNFINALIZED";
export interface GoogleRoutesLedgerEntry { id: string; timestamp: string; service: "google_routes"; requestType: string; deliveryId: string | null; success: boolean | null; cacheHit: boolean; networkSent: boolean; fingerprint: string; retryAttempt: number; endpoint?: string; trigger?: string; caller?: string; reason?: string | null; detailCode?: GoogleRoutesDetailCode; completedAt?: string; elapsedMs?: number; responseStatus?: number; perDeliveryLimitOverride?: boolean; }
export interface GoogleRoutesReasonDefinition { code: string; label: string; meaning: string; network: string; action: string; }
export interface GoogleRoutesDetailDefinition { code: GoogleRoutesDetailCode; label: string; meaning: string; }
/**
 * The settings diagnostic uses these stable codes rather than exposing raw
 * provider payloads. They explain both what happened and whether a Google
 * request could have counted, without storing an address or API key.
 */
export const GOOGLE_ROUTES_REASON_CATALOG: readonly GoogleRoutesReasonDefinition[] = [
  { code: "GOOGLE_API_ROUTE_COMPLETED", label: "Route completed", meaning: "Google returned a usable traffic-aware route snapshot.", network: "NETWORK SENT · COUNTS", action: "No action needed; compare traffic-aware and static durations." },
  { code: "CACHE_HIT", label: "Local cache hit", meaning: "A matching route was served from this device’s six-hour cache.", network: "NO NETWORK · NO QUOTA", action: "No action needed; wait for the cache to expire before a fresh snapshot." },
  { code: "NETWORK_REQUEST", label: "Request in progress", meaning: "A request slot was reserved and the call has not yet produced a final result. Older rows with this code are shown as incomplete/legacy.", network: "NETWORK SENT · COUNTS", action: "Wait for the current call to finish; use a new live test only for an older incomplete row." },
  { code: "GOOGLE_API_KEY_REJECTED", label: "Google rejected the key", meaning: "Google rejected the key, API enablement, billing, or website restriction.", network: "NETWORK SENT · COUNTS", action: "Check Maps JavaScript API and Routes API are enabled, billing is active, and the key allows this site origin." },
  { code: "GOOGLE_API_REQUEST_REJECTED", label: "Request rejected", meaning: "The request was invalid locally or Google returned HTTP 400, commonly due to coordinates or request data.", network: "LOCAL OR NETWORK · SEE STATUS", action: "Check the coordinates and endpoint; local invalid coordinates do not spend a request." },
  { code: "GOOGLE_API_PROVIDER_RATE_LIMITED", label: "Provider rate limited", meaning: "Google returned HTTP 429. The app does not retry automatically.", network: "NETWORK SENT · COUNTS", action: "Wait for provider capacity; the app’s own rolling limits remain in force." },
  { code: "GOOGLE_API_NO_USABLE_ROUTE", label: "No usable route", meaning: "Google answered, but no route contained a usable duration and distance.", network: "NETWORK SENT · COUNTS", action: "Check origin/destination and travel mode; GPS evidence is retained." },
  { code: "GOOGLE_API_UNAVAILABLE", label: "Google unavailable", meaning: "The network, browser permission/CORS path, provider, or an unclassified response prevented a usable result.", network: "MAY HAVE SENT · COUNTS IF SENT", action: "Check connection and key restrictions; there is no automatic retry." },
  { code: "GOOGLE_API_NOT_CONFIGURED", label: "No API key", meaning: "Google Routes was requested without a saved key.", network: "NO NETWORK · NO QUOTA", action: "Save a restricted Routes key only if live traffic snapshots are wanted." },
  { code: "GOOGLE_API_LIVE_DELIVERY_ONLY", label: "Blocked non-live caller", meaning: "A settings, render, history, map, or other non-Delivered caller attempted a route request.", network: "NO NETWORK · NO QUOTA", action: "No action needed; only a live Delivered action is allowed to call Google." },
  { code: "GOOGLE_API_HARD_LIMIT_REACHED", label: "30-day app limit", meaning: "The app’s 3,000-request rolling 30-day circuit breaker blocked the call.", network: "NO NETWORK · NO QUOTA", action: "Wait for rolling capacity; GPS route evidence continues to work." },
  { code: "GOOGLE_API_DAILY_LIMIT_REACHED", label: "24-hour app limit", meaning: "The app’s 150-request rolling 24-hour circuit breaker blocked the call.", network: "NO NETWORK · NO QUOTA", action: "Wait for rolling capacity; no retry is attempted." },
  { code: "DELIVERY_GOOGLE_API_LIMIT_REACHED", label: "Delivery two-call limit", meaning: "This delivery already used its maximum two live route calls (outbound and return).", network: "NO NETWORK · NO QUOTA", action: "No action needed; this delivery cannot spend another call." },
  { code: "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED", label: "Refresh already used", meaning: "This delivery already used its one confirmed routing refresh (up to two extra calls).", network: "NO NETWORK · NO QUOTA", action: "No further refresh is allowed for this delivery; GPS evidence remains available." },
  { code: "GOOGLE_API_CLOCK_SAFETY_BLOCKED", label: "Clock safety block", meaning: "The device clock moved backwards far enough that a new reservation was blocked.", network: "NO NETWORK · NO QUOTA", action: "Correct the device time, then perform a new live test when appropriate." },
  { code: "GOOGLE_API_INCOMPLETE", label: "Incomplete / legacy entry", meaning: "This row has no final completion metadata. It may have been created by an older build or while the app was interrupted, so the provider outcome cannot be reconstructed.", network: "NETWORK MAY HAVE SENT · ALREADY COUNTED IF SENT", action: "Do not treat this as a successful route. Run one fresh live test after checking the connection and key restrictions." },
];
export function googleRoutesReasonDefinition(code: string | null | undefined) {
  return GOOGLE_ROUTES_REASON_CATALOG.find((item) => item.code === code) ?? { code: code ?? "UNKNOWN", label: "Unrecognised / legacy result", meaning: "This entry was saved by an older build or has no known result code.", network: "CHECK ENTRY", action: "Use the timestamp, HTTP status and network flag; run a fresh test if needed." };
}
export const GOOGLE_ROUTES_DETAIL_CATALOG: readonly GoogleRoutesDetailDefinition[] = [
  { code: "NETWORK_STARTED", label: "Network call started", meaning: "A live request slot was reserved and the browser began the provider call." },
  { code: "CACHE_SERVED", label: "Served from cache", meaning: "A matching six-hour local result was returned without network traffic." },
  { code: "BLOCKED_BEFORE_NETWORK", label: "Stopped before network", meaning: "A local safety gate stopped the request before any provider call." },
  { code: "FETCH_UNAVAILABLE", label: "Browser fetch unavailable", meaning: "This runtime had no usable browser fetch function, so no network call could be made." },
  { code: "FETCH_EXCEPTION", label: "Browser/network exception", meaning: "The browser could not complete the call (commonly offline, CORS, permission or connectivity). No provider HTTP status was available." },
  { code: "HTTP_ERROR", label: "Provider HTTP error", meaning: "Google returned an HTTP response outside the successful range; the status is shown separately." },
  { code: "INVALID_JSON", label: "Unreadable provider response", meaning: "The provider response arrived but could not be parsed as the expected JSON shape." },
  { code: "NO_ROUTE_DATA", label: "No usable route data", meaning: "The response was readable but contained no usable duration and distance." },
  { code: "ROUTE_RESULT_SAVED", label: "Result saved", meaning: "A usable route was recorded and placed in the six-hour local cache. Driving uses traffic-aware routing; walking uses pedestrian routing." },
  { code: "MAPS_JS_LOAD_FAILED", label: "Google Maps SDK could not load", meaning: "The supported browser SDK could not load. Check that Maps JavaScript API is enabled and the website restriction includes this app." },
  { code: "MAPS_JS_LIBRARY_FAILED", label: "Routes browser library unavailable", meaning: "Google Maps loaded but its Routes library was not available. Check that both Maps JavaScript API and Routes API are enabled for this key." },
  { code: "MAPS_JS_REFRESH_REQUIRED", label: "Refresh required after key change", meaning: "The Google Maps browser SDK was already loaded with a different key. Refresh the app before a new test." },
  { code: "MAPS_ROUTE_EXCEPTION", label: "Google Maps route request failed", meaning: "The supported browser Routes library rejected the requested route before a usable route could be saved." },
  { code: "LEGACY_UNFINALIZED", label: "Older/incomplete metadata", meaning: "The row predates final-stage logging or was interrupted before final metadata could be written." },
];
export function googleRoutesDetailDefinition(code: string | null | undefined) {
  return GOOGLE_ROUTES_DETAIL_CATALOG.find((item) => item.code === code) ?? { code: "LEGACY_UNFINALIZED" as const, label: "Older/incomplete metadata", meaning: "This row has no recognised final-stage detail code." };
}
export type GoogleRouteTravelMode = "driving" | "walking";
export interface GoogleRouteResult { durationSeconds: number; staticDurationSeconds: number | null; distanceMetres: number; trafficAware: boolean; travelMode: GoogleRouteTravelMode; snapshotAt: string; }
/**
 * The trigger/caller fields are deliberately mandatory.  The central service
 * refuses every route request except the explicit Delivered action or the
 * separately confirmed one-off refresh on a live delivery; render, history
 * and background code cannot spend API budget.
 */
export interface GoogleRouteRequest { deliveryId: string; requestType: "expected_outbound" | "expected_return"; origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number }; /** Ordered stopovers for a single Google route request. */ intermediates?: { latitude: number; longitude: number }[]; apiKey?: string | null; trigger: "manual_delivered" | "delivery_confirmed" | "manual_route_refresh"; caller: "active_shift.delivered_button" | "active_shift.confirmed_destination" | "active_shift.route_refresh_confirmation"; travelMode?: GoogleRouteTravelMode; allowPerDeliveryLimitOverride?: boolean; }
export type GoogleRouteResponse = { ok: true; value: GoogleRouteResult; cacheHit: boolean } | { ok: false; reason: GoogleRoutesBlockReason; cacheHit: false };
export interface GoogleRoutesUsage { rolling30Days: number; rolling24Hours: number; today: number; thisWeek: number; remaining: number; percentage: number; level: "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL" | "LOCKED"; oldestCountedRequest: string | null; nextCapacityRelease: string | null; nextCapacityReleaseCount: number; }

type StoredCache = { fingerprint: string; expiresAt: string; value: GoogleRouteResult };
type KeyValueStore = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): KeyValueStore | null => typeof window === "undefined" ? null : window.localStorage;
const parse = <T,>(store: KeyValueStore | null, key: string, fallback: T): T => { try { const raw = store?.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const emitUsageChanged = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("shift-tracker-google-routes-usage")); };
const dayStart = (now: number) => { const date = new Date(now); date.setHours(0, 0, 0, 0); return date.getTime(); };
const weekStart = (now: number) => { const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.getTime(); };
const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const durationSeconds = (value: unknown) => typeof value === "string" ? Math.round(Number.parseFloat(value) || 0) : 0;
const routeFailureForStatus = (status: number): GoogleRoutesBlockReason => status === 400 ? "GOOGLE_API_REQUEST_REJECTED" : status === 401 || status === 403 ? "GOOGLE_API_KEY_REJECTED" : status === 429 ? "GOOGLE_API_PROVIDER_RATE_LIMITED" : "GOOGLE_API_UNAVAILABLE";
const validCoordinate = (point: { latitude: number; longitude: number }) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180;
type BrowserRoute = { durationMillis?: number; staticDurationMillis?: number; distanceMeters?: number };
type BrowserRoutesLibrary = { Route?: { computeRoutes?: (request: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; intermediates?: { location: { lat: number; lng: number } }[]; travelMode: "DRIVING" | "WALKING"; routingPreference?: "TRAFFIC_AWARE"; fields: string[] }) => Promise<{ routes?: BrowserRoute[] }> } };
type BrowserGoogle = { maps?: { importLibrary?: (library: string) => Promise<unknown> } };
let browserRoutesLibraryPromise: Promise<BrowserRoutesLibrary> | null = null;
let browserRoutesLibraryKey: string | null = null;
const browserRouteError = (detailCode: GoogleRoutesDetailCode, networkSent = false) => Object.assign(new Error(detailCode), { detailCode, networkSent });
const routesLibraryFromWindow = () => (window as Window & { google?: BrowserGoogle }).google?.maps?.importLibrary;
const loadBrowserRoutesLibrary = async (apiKey: string): Promise<BrowserRoutesLibrary> => {
  if (typeof window === "undefined" || typeof document === "undefined") throw browserRouteError("MAPS_JS_LOAD_FAILED");
  const imported = routesLibraryFromWindow();
  if (imported) {
    try {
      const library = await imported("routes") as BrowserRoutesLibrary;
      if (!library.Route?.computeRoutes) throw browserRouteError("MAPS_JS_LIBRARY_FAILED");
      return library;
    } catch (error) { if ((error as { detailCode?: GoogleRoutesDetailCode }).detailCode) throw error; throw browserRouteError("MAPS_JS_LIBRARY_FAILED"); }
  }
  if (browserRoutesLibraryPromise && browserRoutesLibraryKey === apiKey) return browserRoutesLibraryPromise;
  if (browserRoutesLibraryPromise && browserRoutesLibraryKey !== apiKey) throw browserRouteError("MAPS_JS_REFRESH_REQUIRED");
  browserRoutesLibraryKey = apiKey;
  browserRoutesLibraryPromise = new Promise<BrowserRoutesLibrary>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.dataset.shiftTrackerGoogleMaps = "routes";
    script.onerror = () => reject(browserRouteError("MAPS_JS_LOAD_FAILED"));
    script.onload = () => {
      const importer = routesLibraryFromWindow();
      if (!importer) return reject(browserRouteError("MAPS_JS_LIBRARY_FAILED"));
      void importer("routes").then((library) => {
        const typed = library as BrowserRoutesLibrary;
        if (!typed.Route?.computeRoutes) throw browserRouteError("MAPS_JS_LIBRARY_FAILED");
        resolve(typed);
      }).catch(() => reject(browserRouteError("MAPS_JS_LIBRARY_FAILED")));
    };
    document.head.append(script);
  }).catch((error) => { browserRoutesLibraryPromise = null; throw error; });
  return browserRoutesLibraryPromise;
};

export function googleRouteFingerprint(request: GoogleRouteRequest) {
  const point = (value: { latitude: number; longitude: number }) => `${value.latitude.toFixed(5)},${value.longitude.toFixed(5)}`;
  const mode = request.travelMode === "walking" ? "walking" : "traffic-aware";
  const refresh = request.allowPerDeliveryLimitOverride ? "|manual-refresh" : "";
  const intermediates = request.intermediates?.length ? `|via:${request.intermediates.map(point).join(">")}` : "";
  return `${request.deliveryId}|${request.requestType}|${point(request.origin)}>${point(request.destination)}${intermediates}|${mode}${refresh}`;
}

export function getGoogleRoutesUsage(store: KeyValueStore | null = browserStore(), now = Date.now()): GoogleRoutesUsage {
  const entries = parse<GoogleRoutesLedgerEntry[]>(store, LEDGER_KEY, []);
  const counted = entries.filter((entry) => entry.networkSent && Number.isFinite(Date.parse(entry.timestamp)) && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS && Date.parse(entry.timestamp) <= now + 5 * 60_000);
  const last24 = counted.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS);
  const today = counted.filter((entry) => Date.parse(entry.timestamp) >= dayStart(now));
  const thisWeek = counted.filter((entry) => Date.parse(entry.timestamp) >= weekStart(now));
  const oldest = [...counted].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0] ?? null;
  const oldestTime = oldest ? Date.parse(oldest.timestamp) : NaN;
  const releaseAt = Number.isFinite(oldestTime) ? new Date(oldestTime + THIRTY_DAYS_MS).toISOString() : null;
  const releaseCount = oldest ? counted.filter((entry) => entry.timestamp === oldest.timestamp).length : 0;
  const usage = counted.length;
  const level: GoogleRoutesUsage["level"] = usage >= GOOGLE_ROUTES_30_DAY_HARD_LIMIT ? "LOCKED" : usage >= 2_800 ? "CRITICAL" : usage >= 2_500 ? "HIGH" : usage >= 2_000 ? "ELEVATED" : "NORMAL";
  return { rolling30Days: usage, rolling24Hours: last24.length, today: today.length, thisWeek: thisWeek.length, remaining: Math.max(0, GOOGLE_ROUTES_30_DAY_HARD_LIMIT - usage), percentage: Math.round((usage / GOOGLE_ROUTES_30_DAY_HARD_LIMIT) * 100), level, oldestCountedRequest: oldest?.timestamp ?? null, nextCapacityRelease: releaseAt, nextCapacityReleaseCount: releaseCount };
}

/** Read-only audit trail. Entries include blocked attempts and cache hits, but only networkSent contributes to limits. */
export function getGoogleRoutesRequestLog(store: KeyValueStore | null = browserStore(), limit = 20) {
  return parse<GoogleRoutesLedgerEntry[]>(store, LEDGER_KEY, []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

/**
 * All Google Routes calls must use this class. The production path uses the
 * supported Maps JavaScript Routes library; injected fetch is test-only.
 * Reservation happens before the route request, therefore request 3,001
 * cannot reach the network layer.
 */
export class GoogleRoutesService {
  private queue: Promise<void> = Promise.resolve();
  private readonly store: KeyValueStore | null;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch | null;
  constructor(store: KeyValueStore | null = browserStore(), now = () => Date.now(), fetcher: typeof fetch | null = null) { this.store = store; this.now = now; this.fetcher = fetcher; }
  getApiKey() { return this.store?.getItem(API_KEY_STORAGE) ?? ""; }
  setApiKey(value: string) { if (!this.store) return; value.trim() ? this.store.setItem(API_KEY_STORAGE, value.trim()) : this.store.setItem(API_KEY_STORAGE, ""); }
  usage() { return getGoogleRoutesUsage(this.store, this.now()); }
  private ledger() { return parse<GoogleRoutesLedgerEntry[]>(this.store, LEDGER_KEY, []); }
  private saveLedger(entries: GoogleRoutesLedgerEntry[]) { this.store?.setItem(LEDGER_KEY, JSON.stringify(entries.filter((entry) => Date.parse(entry.timestamp) > this.now() - 35 * DAY_MS))); emitUsageChanged(); }
  private cache() { return parse<StoredCache[]>(this.store, CACHE_KEY, []); }
  private saveCache(items: StoredCache[]) { this.store?.setItem(CACHE_KEY, JSON.stringify(items.filter((item) => Date.parse(item.expiresAt) > this.now()))); }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const nativeLocks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: { request: <T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>) => Promise<T> } }).locks : undefined;
      if (nativeLocks) return await nativeLocks.request("shift-tracker-google-routes-reservation", { mode: "exclusive" }, operation);
      // Older browsers lack Web Locks. This short localStorage lease verifies
      // ownership immediately before touching the ledger, so another tab sees
      // the reservation before it can make its own network request.
      let held = parse<{ token: string; expiresAt: number } | null>(this.store, LOCK_KEY, null);
      for (let wait = 0; held && held.expiresAt > this.now() && wait < 40; wait += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        held = parse<{ token: string; expiresAt: number } | null>(this.store, LOCK_KEY, null);
      }
      const token = requestId(); const expiresAt = this.now() + 5_000;
      this.store?.setItem(LOCK_KEY, JSON.stringify({ token, expiresAt }));
      const confirmed = parse<{ token: string } | null>(this.store, LOCK_KEY, null);
      if (confirmed?.token !== token) return await this.exclusive(operation);
      try { return await operation(); } finally { if (parse<{ token: string } | null>(this.store, LOCK_KEY, null)?.token === token) this.store?.setItem(LOCK_KEY, ""); }
    } finally { release(); }
  }
  private endpoint() { return this.fetcher ? "directions/v2:computeRoutes (test transport)" : "maps-javascript-routes:computeRoutes"; }
  private audit(entries: GoogleRoutesLedgerEntry[], request: GoogleRouteRequest, timestamp: number, options: Pick<GoogleRoutesLedgerEntry, "success" | "cacheHit" | "networkSent" | "reason" | "detailCode" | "completedAt" | "elapsedMs" | "responseStatus"> & { retryAttempt: number }) {
    entries.push({ id: requestId(), timestamp: new Date(timestamp).toISOString(), service: "google_routes", requestType: request.requestType, deliveryId: request.deliveryId, fingerprint: googleRouteFingerprint(request), endpoint: this.endpoint(), trigger: request.trigger, caller: request.caller, perDeliveryLimitOverride: request.allowPerDeliveryLimitOverride === true, ...options });
  }
  private async finalize(entryId: string, update: Partial<Pick<GoogleRoutesLedgerEntry, "success" | "networkSent" | "reason" | "detailCode" | "completedAt" | "elapsedMs" | "responseStatus">>) {
    await this.exclusive(async () => {
      const entries = this.ledger();
      const entry = entries.find((item) => item.id === entryId);
      if (entry) Object.assign(entry, update);
      this.saveLedger(entries);
    });
  }
  private reserve(request: GoogleRouteRequest, retryAttempt: number): { cache: GoogleRouteResult | null; reason: GoogleRoutesBlockReason | null; entry: GoogleRoutesLedgerEntry | null } {
    const now = this.now();
    const fingerprint = googleRouteFingerprint(request);
    const entries = this.ledger();
    const explicitLiveTrigger = (request.trigger === "manual_delivered" && request.caller === "active_shift.delivered_button") || (request.trigger === "delivery_confirmed" && request.caller === "active_shift.confirmed_destination") || (request.trigger === "manual_route_refresh" && request.caller === "active_shift.route_refresh_confirmation" && request.allowPerDeliveryLimitOverride === true);
    if (!explicitLiveTrigger) {
      this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_LIVE_DELIVERY_ONLY", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries);
      return { cache: null, reason: "GOOGLE_API_LIVE_DELIVERY_ONLY", entry: null };
    }
    if (!validCoordinate(request.origin) || !validCoordinate(request.destination) || (request.intermediates?.some((point) => !validCoordinate(point)) ?? false)) {
      this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_REQUEST_REJECTED", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries);
      return { cache: null, reason: "GOOGLE_API_REQUEST_REJECTED", entry: null };
    }
    const cache = request.allowPerDeliveryLimitOverride ? null : this.cache().find((item) => item.fingerprint === fingerprint && Date.parse(item.expiresAt) > now);
    if (cache) { this.audit(entries, request, now, { success: true, cacheHit: true, networkSent: false, reason: "CACHE_HIT", detailCode: "CACHE_SERVED", completedAt: new Date(now).toISOString(), elapsedMs: 0, retryAttempt }); this.saveLedger(entries); return { cache: cache.value, reason: null, entry: null }; }
    if (!request.apiKey?.trim()) { this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_NOT_CONFIGURED", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries); return { cache: null, reason: "GOOGLE_API_NOT_CONFIGURED", entry: null }; }
    const latestTrusted = Number(this.store?.getItem(CLOCK_KEY) ?? 0);
    if (Number.isFinite(latestTrusted) && now + 5 * 60_000 < latestTrusted) { this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_CLOCK_SAFETY_BLOCKED", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries); return { cache: null, reason: "GOOGLE_API_CLOCK_SAFETY_BLOCKED", entry: null }; }
    const counted30 = entries.filter((entry) => entry.networkSent && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS && Date.parse(entry.timestamp) <= now + 5 * 60_000);
    if (counted30.length >= GOOGLE_ROUTES_30_DAY_HARD_LIMIT) { this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_HARD_LIMIT_REACHED", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries); return { cache: null, reason: "GOOGLE_API_HARD_LIMIT_REACHED", entry: null }; }
    if (counted30.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS).length >= GOOGLE_ROUTES_24_HOUR_HARD_LIMIT) { this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason: "GOOGLE_API_DAILY_LIMIT_REACHED", detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries); return { cache: null, reason: "GOOGLE_API_DAILY_LIMIT_REACHED", entry: null }; }
    const deliveryRequests = entries.filter((entry) => entry.networkSent && entry.deliveryId === request.deliveryId);
    const overrideRequests = deliveryRequests.filter((entry) => entry.perDeliveryLimitOverride === true);
    if (request.allowPerDeliveryLimitOverride ? overrideRequests.length >= GOOGLE_ROUTES_PER_DELIVERY_OVERRIDE_HARD_LIMIT : deliveryRequests.length >= GOOGLE_ROUTES_PER_DELIVERY_HARD_LIMIT) {
      const reason = request.allowPerDeliveryLimitOverride ? "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED" : "DELIVERY_GOOGLE_API_LIMIT_REACHED";
      this.audit(entries, request, now, { success: false, cacheHit: false, networkSent: false, reason, detailCode: "BLOCKED_BEFORE_NETWORK", retryAttempt }); this.saveLedger(entries); return { cache: null, reason, entry: null };
    }
    const entry: GoogleRoutesLedgerEntry = { id: requestId(), timestamp: new Date(now).toISOString(), service: "google_routes", requestType: request.requestType, deliveryId: request.deliveryId, success: null, cacheHit: false, networkSent: true, fingerprint, endpoint: this.endpoint(), trigger: request.trigger, caller: request.caller, reason: "NETWORK_REQUEST", detailCode: "NETWORK_STARTED", retryAttempt, perDeliveryLimitOverride: request.allowPerDeliveryLimitOverride === true };
    entries.push(entry); this.saveLedger(entries); this.store?.setItem(CLOCK_KEY, String(Math.max(latestTrusted || 0, now))); return { cache: null, reason: null, entry };
  }
  async computeRoute(request: GoogleRouteRequest, retryAttempt = 0): Promise<GoogleRouteResponse> {
    const reservation = await this.exclusive(async () => this.reserve(request, retryAttempt));
    if (reservation.cache) return { ok: true, value: reservation.cache, cacheHit: true };
    if (reservation.reason || !reservation.entry) return { ok: false, reason: reservation.reason ?? "GOOGLE_API_UNAVAILABLE", cacheHit: false };
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = () => Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt));
    const travelMode: GoogleRouteTravelMode = request.travelMode === "walking" ? "walking" : "driving";
    try {
      let value: GoogleRouteResult;
      let responseStatus: number | undefined;
      if (this.fetcher) {
        // Tests retain a small injectable transport. Production does not make
        // this direct REST call from the browser.
        const response = await this.fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": request.apiKey!, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters" }, body: JSON.stringify({ origin: { location: { latLng: request.origin } }, destination: { location: { latLng: request.destination } }, ...(request.intermediates?.length ? { intermediates: request.intermediates.map((point) => ({ location: { latLng: point } })) } : {}), travelMode: travelMode === "walking" ? "WALK" : "DRIVE", ...(travelMode === "driving" ? { routingPreference: "TRAFFIC_AWARE" } : {}) }) });
        responseStatus = response.status;
        if (!response.ok) throw Object.assign(new Error("Google Routes unavailable"), { routeReason: routeFailureForStatus(response.status), detailCode: "HTTP_ERROR" as const, responseStatus });
        let json: { routes?: { duration?: string; staticDuration?: string; distanceMeters?: number }[] };
        try { json = await response.json() as { routes?: { duration?: string; staticDuration?: string; distanceMeters?: number }[] }; } catch { throw Object.assign(new Error("Google Routes response could not be parsed"), { routeReason: "GOOGLE_API_UNAVAILABLE" as const, detailCode: "INVALID_JSON" as const, responseStatus }); }
        const route = json.routes?.[0];
        value = { durationSeconds: durationSeconds(route?.duration), staticDurationSeconds: route?.staticDuration ? durationSeconds(route.staticDuration) : null, distanceMetres: Math.round(route?.distanceMeters ?? 0), trafficAware: travelMode === "driving", travelMode, snapshotAt: new Date(this.now()).toISOString() };
      } else {
        const library = await loadBrowserRoutesLibrary(request.apiKey!);
        let result: { routes?: BrowserRoute[] };
        try {
          result = await library.Route!.computeRoutes!({ origin: { lat: request.origin.latitude, lng: request.origin.longitude }, destination: { lat: request.destination.latitude, lng: request.destination.longitude }, ...(request.intermediates?.length ? { intermediates: request.intermediates.map((point) => ({ location: { lat: point.latitude, lng: point.longitude } })) } : {}), travelMode: travelMode === "walking" ? "WALKING" : "DRIVING", ...(travelMode === "driving" ? { routingPreference: "TRAFFIC_AWARE" as const } : {}), fields: ["durationMillis", "staticDurationMillis", "distanceMeters"] });
        } catch {
          throw browserRouteError("MAPS_ROUTE_EXCEPTION", true);
        }
        const route = result.routes?.[0];
        value = { durationSeconds: Math.round(Number(route?.durationMillis ?? 0) / 1000), staticDurationSeconds: Number.isFinite(route?.staticDurationMillis) ? Math.round(Number(route?.staticDurationMillis) / 1000) : null, distanceMetres: Math.round(Number(route?.distanceMeters ?? 0)), trafficAware: travelMode === "driving", travelMode, snapshotAt: new Date(this.now()).toISOString() };
      }
      if (!value.durationSeconds || !Number.isFinite(value.distanceMetres) || value.distanceMetres <= 0) throw Object.assign(new Error("Google Routes returned no usable route"), { routeReason: "GOOGLE_API_NO_USABLE_ROUTE" as const, detailCode: "NO_ROUTE_DATA" as const, responseStatus });
      await this.exclusive(async () => { const entries = this.ledger(); const entry = entries.find((item) => item.id === reservation.entry!.id); if (entry) { entry.success = true; entry.reason = "GOOGLE_API_ROUTE_COMPLETED"; entry.detailCode = "ROUTE_RESULT_SAVED"; entry.completedAt = new Date(this.now()).toISOString(); entry.elapsedMs = elapsed(); if (Number.isFinite(responseStatus)) entry.responseStatus = responseStatus; } this.saveLedger(entries); const cache = this.cache().filter((item) => item.fingerprint !== reservation.entry!.fingerprint); cache.push({ fingerprint: reservation.entry!.fingerprint, expiresAt: new Date(this.now() + 6 * 60 * 60_000).toISOString(), value }); this.saveCache(cache); });
      return { ok: true, value, cacheHit: false };
    } catch (error) {
      const reason = (error as { routeReason?: GoogleRoutesBlockReason }).routeReason ?? "GOOGLE_API_UNAVAILABLE";
      const detailCode = (error as { detailCode?: GoogleRoutesDetailCode }).detailCode ?? (this.fetcher ? "FETCH_EXCEPTION" : "MAPS_ROUTE_EXCEPTION");
      const responseStatus = (error as { responseStatus?: number }).responseStatus;
      const networkSent = (error as { networkSent?: boolean }).networkSent;
      await this.exclusive(async () => { const entries = this.ledger(); const entry = entries.find((item) => item.id === reservation.entry!.id); if (entry) { entry.success = false; entry.reason = reason; entry.detailCode = detailCode; entry.completedAt = new Date(this.now()).toISOString(); entry.elapsedMs = elapsed(); if (networkSent === false) entry.networkSent = false; if (Number.isFinite(responseStatus)) entry.responseStatus = responseStatus; } this.saveLedger(entries); });
      // No automatic retry: a delivery gets one outbound and one return call,
      // full stop. A failure falls back to local GPS evidence.
      return { ok: false, reason, cacheHit: false };
    }
  }
}

export const googleRoutesService = new GoogleRoutesService();
