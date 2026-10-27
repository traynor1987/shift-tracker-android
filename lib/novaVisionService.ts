export interface VisionAddressCandidate {
  addressFound: boolean;
  houseNumberOrName?: string;
  street?: string;
  locality?: string;
  postcode?: string;
  fullAddressCandidate?: string;
  confidence: number;
  needsConfirmation: boolean;
  uncertainFields?: string[];
}

import { paidServiceHeaders } from "./hostedBackup.ts";
export const NOVA_24_HOUR_HARD_LIMIT = 50;
export const NOVA_30_DAY_HARD_LIMIT = 500;
export const NOVA_PER_DELIVERY_HARD_LIMIT = 2;

const DAY_MS = 86_400_000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const LEDGER_KEY = "shift-tracker-nova-vision-ledger-v1";
const CACHE_KEY = "shift-tracker-nova-vision-cache-v1";
const STATUS_KEY = "shift-tracker-nova-vision-status-v1";
type Store = Pick<Storage, "getItem" | "setItem">;
type LedgerEntry = { id: string; timestamp: string; service: "nova_vision"; deliveryId: string | null; success: boolean | null; cacheHit: boolean; networkSent: boolean; fingerprint: string; reason?: string };
type CacheEntry = { fingerprint: string; expiresAt: string; value: VisionAddressCandidate };
const store = (): Store | null => typeof window === "undefined" ? null : window.localStorage;
const parse = <T,>(source: Store | null, key: string, fallback: T): T => { try { const raw = source?.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const fingerprint = (value: string) => { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `image:${(hash >>> 0).toString(16)}`; };
const emit = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("shift-tracker-nova-vision-usage")); };

export interface NovaVisionUsage { today: number; thisMonth: number; successful: number; failed: number; cached: number; remainingToday: number; remainingMonth: number; status: "connected" | "not_configured"; }
export type NovaConnectionCheck = { state: "connected"; model?: string } | { state: "missing"; reason: "OPENAI_API_KEY_MISSING" } | { state: "unavailable"; reason: "NOVA_ENDPOINT_UNAVAILABLE" };

export function getNovaVisionLog(source: Store | null = store(), limit = 50) { return parse<LedgerEntry[]>(source, LEDGER_KEY, []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit); }
export function getNovaVisionUsage(source: Store | null = store(), now = Date.now()): NovaVisionUsage {
  const entries = parse<LedgerEntry[]>(source, LEDGER_KEY, []).filter((entry) => Number.isFinite(Date.parse(entry.timestamp)));
  const recent = entries.filter((entry) => Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS);
  const today = recent.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS && entry.networkSent).length;
  const month = recent.filter((entry) => entry.networkSent).length;
  const successful = recent.filter((entry) => entry.networkSent && entry.success === true).length;
  const failed = recent.filter((entry) => entry.networkSent && entry.success === false).length;
  const cached = recent.filter((entry) => entry.cacheHit).length;
  const status = source?.getItem(STATUS_KEY) === "connected" ? "connected" : "not_configured";
  return { today, thisMonth: month, successful, failed, cached, remainingToday: Math.max(0, NOVA_24_HOUR_HARD_LIMIT - today), remainingMonth: Math.max(0, NOVA_30_DAY_HARD_LIMIT - month), status };
}
const save = (source: Store | null, entries: LedgerEntry[]) => { try { source?.setItem(LEDGER_KEY, JSON.stringify(entries.filter((entry) => Date.parse(entry.timestamp) > Date.now() - 35 * DAY_MS))); } catch { /* local audit is best effort */ } emit(); };
const setStatus = (source: Store | null, value: "connected" | "not_configured") => { try { source?.setItem(STATUS_KEY, value); } catch { /* optional */ } };

export function clearNovaVisionCache(source: Store | null = store()) {
  try { source?.setItem(CACHE_KEY, "[]"); } catch { /* best effort privacy cleanup */ }
}

export type NovaVisionResponse = { ok: true; value: VisionAddressCandidate; cacheHit: boolean } | { ok: false; reason: "NOVA_HARD_LIMIT_REACHED" | "NOVA_DAILY_LIMIT_REACHED" | "DELIVERY_NOVA_LIMIT_REACHED" | "NOVA_UNAVAILABLE" | "NOVA_NOT_CONFIGURED"; cacheHit: false };

export class NovaVisionService {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly source: Store | null = store(), private readonly now: () => number = () => Date.now(), private readonly fetcher: typeof fetch | null = typeof fetch === "function" ? fetch : null) {}
  async checkConnection(): Promise<NovaConnectionCheck> {
    try {
      const response = await this.fetcher?.("/api/nova/status", { method: "GET", cache: "no-store" });
      if (!response) return { state: "unavailable", reason: "NOVA_ENDPOINT_UNAVAILABLE" };
      const payload = await response.json() as { configured?: boolean; model?: string };
      if (response.ok && payload.configured === true) { setStatus(this.source, "connected"); return { state: "connected", model: payload.model }; }
      if (payload.configured === false) { setStatus(this.source, "not_configured"); return { state: "missing", reason: "OPENAI_API_KEY_MISSING" }; }
      return { state: "unavailable", reason: "NOVA_ENDPOINT_UNAVAILABLE" };
    } catch { return { state: "unavailable", reason: "NOVA_ENDPOINT_UNAVAILABLE" }; }
  }
  private async exclusive<T>(operation: () => Promise<T>) { const previous = this.queue; let release!: () => void; this.queue = new Promise<void>((resolve) => { release = resolve; }); await previous; try { return await operation(); } finally { release(); } }
  async extract(imageDataUrl: string, options: { deliveryId?: string | null; force?: boolean; signal?: AbortSignal } = {}): Promise<NovaVisionResponse> {
    if (!imageDataUrl.startsWith("data:image/")) return { ok: false, reason: "NOVA_UNAVAILABLE", cacheHit: false };
    return this.exclusive(async () => {
      const now = this.now(); const key = fingerprint(imageDataUrl); const entries = parse<LedgerEntry[]>(this.source, LEDGER_KEY, []);
      const cached = options.force ? null : parse<CacheEntry[]>(this.source, CACHE_KEY, []).find((entry) => entry.fingerprint === key && Date.parse(entry.expiresAt) > now);
      if (cached) { entries.push({ id: id(), timestamp: new Date(now).toISOString(), service: "nova_vision", deliveryId: options.deliveryId ?? null, success: true, cacheHit: true, networkSent: false, fingerprint: key, reason: "CACHE_HIT" }); save(this.source, entries); return { ok: true, value: cached.value, cacheHit: true }; }
      const recent = entries.filter((entry) => entry.networkSent && Date.parse(entry.timestamp) > now - THIRTY_DAYS_MS);
      const day = recent.filter((entry) => Date.parse(entry.timestamp) > now - DAY_MS);
      const delivery = recent.filter((entry) => entry.deliveryId && entry.deliveryId === options.deliveryId);
      const blocked = recent.length >= NOVA_30_DAY_HARD_LIMIT ? "NOVA_HARD_LIMIT_REACHED" : day.length >= NOVA_24_HOUR_HARD_LIMIT ? "NOVA_DAILY_LIMIT_REACHED" : delivery.length >= NOVA_PER_DELIVERY_HARD_LIMIT ? "DELIVERY_NOVA_LIMIT_REACHED" : null;
      if (blocked) { entries.push({ id: id(), timestamp: new Date(now).toISOString(), service: "nova_vision", deliveryId: options.deliveryId ?? null, success: false, cacheHit: false, networkSent: false, fingerprint: key, reason: blocked }); save(this.source, entries); return { ok: false, reason: blocked, cacheHit: false }; }
      const entry: LedgerEntry = { id: id(), timestamp: new Date(now).toISOString(), service: "nova_vision", deliveryId: options.deliveryId ?? null, success: null, cacheHit: false, networkSent: true, fingerprint: key, reason: "NETWORK_REQUEST" }; entries.push(entry); save(this.source, entries);
      try {
        const response = await this.fetcher?.("/api/nova/extract-delivery-address", { method: "POST", headers: { ...(await paidServiceHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl }), signal: options.signal });
        if (!response?.ok) throw new Error("Nova unavailable");
        const value = await response.json() as VisionAddressCandidate;
        if (!value || typeof value.addressFound !== "boolean") throw new Error("Invalid Nova response");
        const savedEntries = parse<LedgerEntry[]>(this.source, LEDGER_KEY, []); const savedEntry = savedEntries.find((item) => item.id === entry.id); if (savedEntry) savedEntry.success = true; save(this.source, savedEntries); setStatus(this.source, "connected");
        try { const cache = parse<CacheEntry[]>(this.source, CACHE_KEY, []).filter((item) => item.fingerprint !== key); cache.push({ fingerprint: key, expiresAt: new Date(now + 15 * 60_000).toISOString(), value }); this.source?.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* optional */ }
        return { ok: true, value, cacheHit: false };
      } catch {
        const savedEntries = parse<LedgerEntry[]>(this.source, LEDGER_KEY, []); const savedEntry = savedEntries.find((item) => item.id === entry.id); if (savedEntry) savedEntry.success = false; save(this.source, savedEntries); setStatus(this.source, "not_configured");
        return { ok: false, reason: "NOVA_UNAVAILABLE", cacheHit: false };
      }
    });
  }
}

export const novaVisionService = new NovaVisionService();
export async function extractDeliveryAddress(imageDataUrl: string, options: { deliveryId?: string | null; force?: boolean; signal?: AbortSignal } = {}) { const response = await novaVisionService.extract(imageDataUrl, options); return response.ok ? response.value : null; }
