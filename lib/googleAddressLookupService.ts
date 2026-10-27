/**
 * Google Geocoding is deliberately separate from Google Routes. It is only
 * called from the explicit address-confirmation workflow, never from render,
 * history, Settings or route-map analytics.
 */
import { paidServiceHeaders } from "./hostedBackup.ts";
export const GOOGLE_GEOCODING_30_DAY_HARD_LIMIT = 5_000;
export const GOOGLE_GEOCODING_24_HOUR_HARD_LIMIT = 150;
export const GOOGLE_GEOCODING_PER_MINUTE_HARD_LIMIT = 10;
export const GOOGLE_GEOCODING_PER_DELIVERY_HARD_LIMIT = 3;
export const GOOGLE_ADDRESS_30_DAY_HARD_LIMIT = GOOGLE_GEOCODING_30_DAY_HARD_LIMIT;
export const GOOGLE_ADDRESS_24_HOUR_HARD_LIMIT = GOOGLE_GEOCODING_24_HOUR_HARD_LIMIT;
export const GOOGLE_ADDRESS_PER_DELIVERY_HARD_LIMIT = GOOGLE_GEOCODING_PER_DELIVERY_HARD_LIMIT;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;
const LEDGER_KEY = "shift-tracker-google-geocoding-ledger-v2";
const CACHE_KEY = "shift-tracker-google-geocoding-cache-v2";

export interface GoogleAddressLookupResult { displayName: string; street?: string; locality?: string; postcode?: string; houseNumberOrName?: string; latitude: number; longitude: number; confidence: "high" | "medium" | "low"; }
export interface GoogleAddressLedgerEntry { id: string; timestamp: string; service: "google_geocoding"; deliveryId: string | null; requestType: "geocode"; success: boolean | null; cacheHit: boolean; networkSent: boolean; fingerprint: string; reason?: string | null; }
export interface GoogleGeocodingUsage { rolling30Days: number; rolling24Hours: number; thisMinute: number; remaining: number; cacheHits: number; requestsAvoided: number; failedRequests: number; }

type Store = Pick<Storage, "getItem" | "setItem">;
type CacheItem = { fingerprint: string; expiresAt: string; value: GoogleAddressLookupResult };
const store = (): Store | null => typeof window === "undefined" ? null : window.localStorage;
const parse = <T,>(source: Store | null, key: string, fallback: T): T => { try { const raw = source?.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16); };
const fingerprintFor = (query: string) => `geocode:${hash(query.trim().toLowerCase().replace(/\s+/g, " "))}`;
const emit = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("shift-tracker-google-address-usage")); };
const validTime = (timestamp: string) => Number.isFinite(Date.parse(timestamp));

export type GoogleAddressLookupResponse = { ok: true; value: GoogleAddressLookupResult; cacheHit: boolean } | { ok: false; reason: "GOOGLE_ADDRESS_LIMIT_REACHED" | "GOOGLE_ADDRESS_DAILY_LIMIT_REACHED" | "GOOGLE_ADDRESS_MINUTE_LIMIT_REACHED" | "DELIVERY_ADDRESS_LOOKUP_LIMIT_REACHED" | "GOOGLE_ADDRESS_UNAVAILABLE" | "GOOGLE_ADDRESS_NOT_CONFIGURED"; cacheHit: false };

export function getGoogleAddressLookupLog(source: Store | null = store(), limit = 50) { return parse<GoogleAddressLedgerEntry[]>(source, LEDGER_KEY, []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit); }
export function getGoogleAddressLookupUsage(source: Store | null = store(), now = Date.now()): GoogleGeocodingUsage {
  const entries = parse<GoogleAddressLedgerEntry[]>(source, LEDGER_KEY, []);
  const valid = entries.filter((entry) => validTime(entry.timestamp));
  const counted = valid.filter((entry) => entry.networkSent && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS && Date.parse(entry.timestamp) <= now + 5 * 60_000);
  const last24 = counted.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS);
  const lastMinute = counted.filter((entry) => Date.parse(entry.timestamp) > now - MINUTE_MS);
  const cacheHits = valid.filter((entry) => entry.cacheHit && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS).length;
  const failedRequests = counted.filter((entry) => entry.success === false).length;
  return { rolling30Days: counted.length, rolling24Hours: last24.length, thisMinute: lastMinute.length, remaining: Math.max(0, GOOGLE_GEOCODING_30_DAY_HARD_LIMIT - counted.length), cacheHits, requestsAvoided: cacheHits, failedRequests };
}
export function clearGoogleAddressLookupCache(source: Store | null = store()) { try { source?.setItem(CACHE_KEY, "[]"); } catch { /* best effort */ } }

export class GoogleAddressLookupService {
  private queue: Promise<void> = Promise.resolve();
  private readonly source: Store | null;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch | null;
  constructor(source: Store | null = store(), now: () => number = () => Date.now(), fetcher: typeof fetch | null = typeof fetch === "function" ? fetch : null) {
    this.source = source;
    this.now = now;
    this.fetcher = fetcher;
  }
  usage() { return getGoogleAddressLookupUsage(this.source, this.now()); }
  private entries() { return parse<GoogleAddressLedgerEntry[]>(this.source, LEDGER_KEY, []); }
  private save(entries: GoogleAddressLedgerEntry[]) { try { this.source?.setItem(LEDGER_KEY, JSON.stringify(entries.filter((entry) => Date.parse(entry.timestamp) > this.now() - 35 * 24 * 60 * 60_000))); } catch { /* ledger is best effort */ } emit(); }
  private async exclusive<T>(operation: () => Promise<T>) { const previous = this.queue; let release!: () => void; this.queue = new Promise<void>((resolve) => { release = resolve; }); await previous; try { return await operation(); } finally { release(); } }
  async lookup(query: string, options: { deliveryId?: string | null; storeLatitude?: number; storeLongitude?: number } = {}): Promise<GoogleAddressLookupResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { ok: false, reason: "GOOGLE_ADDRESS_UNAVAILABLE", cacheHit: false };
    return this.exclusive(async () => {
      const now = this.now();
      const fingerprint = fingerprintFor(trimmed);
      const entries = this.entries();
      const cache = parse<CacheItem[]>(this.source, CACHE_KEY, []).find((item) => item.fingerprint === fingerprint && Date.parse(item.expiresAt) > now);
      if (cache) { entries.push({ id: id(), timestamp: new Date(now).toISOString(), service: "google_geocoding", deliveryId: options.deliveryId ?? null, requestType: "geocode", success: true, cacheHit: true, networkSent: false, fingerprint, reason: "CACHE_HIT" }); this.save(entries); return { ok: true, value: cache.value, cacheHit: true }; }
      const counted30 = entries.filter((entry) => entry.networkSent && validTime(entry.timestamp) && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS && Date.parse(entry.timestamp) <= now + 5 * 60_000);
      const counted24 = counted30.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS);
      const countedMinute = counted30.filter((entry) => Date.parse(entry.timestamp) > now - MINUTE_MS);
      const perDelivery = counted30.filter((entry) => entry.deliveryId && entry.deliveryId === options.deliveryId);
      const blocked = counted30.length >= GOOGLE_GEOCODING_30_DAY_HARD_LIMIT ? "GOOGLE_ADDRESS_LIMIT_REACHED" : counted24.length >= GOOGLE_GEOCODING_24_HOUR_HARD_LIMIT ? "GOOGLE_ADDRESS_DAILY_LIMIT_REACHED" : countedMinute.length >= GOOGLE_GEOCODING_PER_MINUTE_HARD_LIMIT ? "GOOGLE_ADDRESS_MINUTE_LIMIT_REACHED" : perDelivery.length >= GOOGLE_GEOCODING_PER_DELIVERY_HARD_LIMIT ? "DELIVERY_ADDRESS_LOOKUP_LIMIT_REACHED" : null;
      if (blocked) { entries.push({ id: id(), timestamp: new Date(now).toISOString(), service: "google_geocoding", deliveryId: options.deliveryId ?? null, requestType: "geocode", success: false, cacheHit: false, networkSent: false, fingerprint, reason: blocked }); this.save(entries); return { ok: false, reason: blocked, cacheHit: false }; }
      const entry: GoogleAddressLedgerEntry = { id: id(), timestamp: new Date(now).toISOString(), service: "google_geocoding", deliveryId: options.deliveryId ?? null, requestType: "geocode", success: null, cacheHit: false, networkSent: true, fingerprint, reason: "NETWORK_REQUEST" };
      entries.push(entry); this.save(entries);
      try {
        const response = await this.fetcher?.("/api/google/geocode", { method: "POST", headers: { ...(await paidServiceHeaders()), Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query: trimmed, storeLatitude: options.storeLatitude, storeLongitude: options.storeLongitude }) });
        if (!response?.ok) throw new Error("Google geocoding unavailable");
        const json = await response.json() as { status?: string; results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } }; address_components?: Array<{ long_name?: string; types?: string[] }> }> };
        const result = json.results?.[0]; const location = result?.geometry?.location;
        if (json.status !== "OK" || !result || !location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) throw new Error("No address match");
        const component = (type: string) => result.address_components?.find((item) => item.types?.includes(type))?.long_name;
        const value: GoogleAddressLookupResult = { displayName: result.formatted_address ?? trimmed, street: component("route"), locality: component("postal_town") ?? component("locality") ?? component("administrative_area_level_2"), postcode: component("postal_code"), houseNumberOrName: component("street_number"), latitude: Number(location.lat), longitude: Number(location.lng), confidence: json.results?.length === 1 ? "high" : "medium" };
        const saved = this.entries(); const savedEntry = saved.find((item) => item.id === entry.id); if (savedEntry) savedEntry.success = true; this.save(saved);
        try { const cacheItems = parse<CacheItem[]>(this.source, CACHE_KEY, []).filter((item) => item.fingerprint !== fingerprint); cacheItems.push({ fingerprint, expiresAt: new Date(now + 10 * 60_000).toISOString(), value }); this.source?.setItem(CACHE_KEY, JSON.stringify(cacheItems)); } catch { /* cache is optional */ }
        return { ok: true, value, cacheHit: false };
      } catch {
        const saved = this.entries(); const savedEntry = saved.find((item) => item.id === entry.id); if (savedEntry) savedEntry.success = false; this.save(saved);
        return { ok: false, reason: "GOOGLE_ADDRESS_UNAVAILABLE", cacheHit: false };
      }
    });
  }
}

export const googleAddressLookupService = new GoogleAddressLookupService();
export const googleGeocodingService = googleAddressLookupService;
