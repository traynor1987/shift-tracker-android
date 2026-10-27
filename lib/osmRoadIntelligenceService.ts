import type { DeliveryRoutePoint, OSMRoadFeatureSettings, TrafficSignal } from "./domain.ts";

/** Privacy-safe OSM input. Only recorded GPS coordinates are accepted. */
export interface OSMRoadCorridor { points: Array<Pick<DeliveryRoutePoint, "latitude" | "longitude">>; paddingMetres?: number; featureSettings?: OSMRoadFeatureSettings; }

export type OSMRoadFeatureType = "TRAFFIC_SIGNAL" | "STOP_SIGN" | "GIVE_WAY" | "PEDESTRIAN_CROSSING" | "TRAFFIC_CALMING" | "ROUNDABOUT" | "ROAD" | "TURN_RESTRICTION" | "ACCESS_RESTRICTION";

/** A mapped road feature. This never contains a customer address or delivery id. */
export interface OSMRoadFeature {
  id: string;
  featureType: OSMRoadFeatureType;
  latitude: number;
  longitude: number;
  source: "OSM";
  name?: string;
  highway?: string;
  roadClass?: string;
  maxspeedRaw?: string;
  maxspeedMph?: number | null;
  oneway?: boolean;
  access?: string;
  restriction?: string;
  trafficCalming?: string;
}

export interface OSMRoadContext {
  bounds: { south: number; west: number; north: number; east: number };
  signals: TrafficSignal[];
  features: OSMRoadFeature[];
  fromCache: boolean;
  /** Never present an empty failed lookup as a successful zero-feature result. */
  availability: "ready" | "stale" | "unavailable";
}

const CACHE_KEY = "shift-tracker-osm-road-context-v1";
const LEGACY_SIGNAL_CACHE_KEYS = ["shift-tracker-osm-road-signals-v3", "shift-tracker-osm-road-signals-v2"];
const CACHE_MAX_AGE = 60 * 86_400_000;
const MAX_CACHE_ENTRIES = 16;
type Bounds = OSMRoadContext["bounds"];
type OSMRoadFeatureGroup = keyof OSMRoadFeatureSettings;
type CacheEntry = { savedAt: number; bounds: Bounds; features: OSMRoadFeature[]; featureGroups?: OSMRoadFeatureGroup[]; retryAfter?: number };
type CachePayload = { entries: CacheEntry[] };
type LegacySignalCacheEntry = { savedAt?: number; bounds?: Bounds; signals?: TrafficSignal[]; retryAfter?: number };
type LegacySignalCachePayload = { entries?: LegacySignalCacheEntry[] };
type OverpassElement = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };

// Summary cards and route evidence can ask for the same corridor at once.
// Sharing this promise prevents duplicate Overpass calls during rendering.
const inFlight = new Map<string, Promise<OSMRoadContext>>();
const ALL_FEATURE_GROUPS: OSMRoadFeatureGroup[] = ["trafficSignals", "junctionControls", "pedestrianCrossings", "calmingAndRoundabouts", "roadMetadata", "restrictions"];
const DEFAULT_FEATURE_SETTINGS: OSMRoadFeatureSettings = { trafficSignals: true, junctionControls: true, pedestrianCrossings: true, calmingAndRoundabouts: true, roadMetadata: true, restrictions: true };

const normaliseFeatureSettings = (settings?: OSMRoadFeatureSettings): OSMRoadFeatureSettings => ({ ...DEFAULT_FEATURE_SETTINGS, ...(settings ?? {}) });
const enabledFeatureGroups = (settings: OSMRoadFeatureSettings): OSMRoadFeatureGroup[] => ALL_FEATURE_GROUPS.filter((group) => settings[group]);
const featureGroupsKey = (groups: OSMRoadFeatureGroup[]) => [...groups].sort().join(",");
const entryCoversFeatureGroups = (entry: CacheEntry, requested: OSMRoadFeatureGroup[]) => {
  const cached = entry.featureGroups ?? ALL_FEATURE_GROUPS;
  return requested.every((group) => cached.includes(group));
};

function featureEnabled(feature: OSMRoadFeature, settings: OSMRoadFeatureSettings): boolean {
  if (feature.featureType === "TRAFFIC_SIGNAL") return settings.trafficSignals;
  if (feature.featureType === "STOP_SIGN" || feature.featureType === "GIVE_WAY") return settings.junctionControls;
  if (feature.featureType === "PEDESTRIAN_CROSSING") return settings.pedestrianCrossings;
  if (feature.featureType === "TRAFFIC_CALMING" || feature.featureType === "ROUNDABOUT") return settings.calmingAndRoundabouts;
  if (feature.featureType === "TURN_RESTRICTION" || feature.featureType === "ACCESS_RESTRICTION") return settings.restrictions;
  if (feature.featureType === "ROAD") return settings.roadMetadata || (settings.restrictions && feature.oneway === true);
  return false;
}

const filterFeatures = (features: OSMRoadFeature[], settings: OSMRoadFeatureSettings) => features.filter((feature) => featureEnabled(feature, settings));

const toBounds = (points: OSMRoadCorridor["points"], paddingMetres: number): Bounds => {
  const lats = points.map((point) => point.latitude); const lngs = points.map((point) => point.longitude);
  const latPad = paddingMetres / 111_000;
  const lngPad = paddingMetres / (111_000 * Math.max(.25, Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180)));
  return { south: Math.min(...lats) - latPad, west: Math.min(...lngs) - lngPad, north: Math.max(...lats) + latPad, east: Math.max(...lngs) + lngPad };
};

const normaliseBounds = (bounds: Bounds) => Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Number(value.toFixed(5))])) as Bounds;
const boundsKey = (bounds: Bounds) => [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => value.toFixed(5)).join(",");
const covers = (outer: Bounds | undefined, inner: Bounds) => Boolean(outer && outer.south <= inner.south && outer.west <= inner.west && outer.north >= inner.north && outer.east >= inner.east);
const entryUsable = (entry: CacheEntry) => Boolean(entry.retryAfter ? Date.now() < entry.retryAfter : Date.now() - entry.savedAt < CACHE_MAX_AGE);

function signalToFeature(signal: TrafficSignal): OSMRoadFeature {
  return { id: signal.id, featureType: "TRAFFIC_SIGNAL", latitude: signal.latitude, longitude: signal.longitude, source: "OSM" };
}

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}

function read(): CachePayload {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const current = readJSON<Partial<CachePayload>>(CACHE_KEY);
    if (Array.isArray(current?.entries)) return { entries: current.entries.filter((entry): entry is CacheEntry => Boolean(entry?.bounds && Array.isArray(entry.features))) };
    // Earlier builds cached only traffic signals. Keep those regional results
    // useful while the richer context cache warms up.
    for (const key of LEGACY_SIGNAL_CACHE_KEYS) {
      const legacy = readJSON<LegacySignalCachePayload | LegacySignalCacheEntry>(key);
      if (Array.isArray((legacy as LegacySignalCachePayload)?.entries)) {
        const entries = ((legacy as LegacySignalCachePayload).entries ?? []).filter((entry): entry is LegacySignalCacheEntry & { bounds: Bounds; signals: TrafficSignal[] } => Boolean(entry?.bounds && Array.isArray(entry.signals))).map((entry) => ({ savedAt: entry.savedAt ?? 0, retryAfter: entry.retryAfter, bounds: entry.bounds, features: entry.signals.map(signalToFeature), featureGroups: ["trafficSignals" as const] }));
        if (entries.length) return { entries };
      } else if ((legacy as LegacySignalCacheEntry)?.bounds && Array.isArray((legacy as LegacySignalCacheEntry).signals)) {
        const entry = legacy as LegacySignalCacheEntry & { bounds: Bounds; signals: TrafficSignal[] };
        return { entries: [{ savedAt: entry.savedAt ?? 0, retryAfter: entry.retryAfter, bounds: entry.bounds, features: entry.signals.map(signalToFeature), featureGroups: ["trafficSignals"] }] };
      }
    }
  } catch { /* Treat malformed device cache as empty. */ }
  return { entries: [] };
}

function write(payload: CachePayload) {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: payload.entries.slice(-MAX_CACHE_ENTRIES) })); } catch { /* Quota/private mode: live analysis still works. */ }
  }
}

function cachedContext(bounds: Bounds, settings: OSMRoadFeatureSettings, requestedGroups: OSMRoadFeatureGroup[]): OSMRoadContext | null {
  const entry = read().entries.find((candidate) => entryUsable(candidate) && covers(candidate.bounds, bounds) && entryCoversFeatureGroups(candidate, requestedGroups));
  if (!entry) return null;
  const retrying = Boolean(entry.retryAfter && Date.now() < entry.retryAfter);
  const features = filterFeatures(entry.features, settings);
  return { bounds: entry.bounds, features, signals: features.filter((feature) => feature.featureType === "TRAFFIC_SIGNAL").map((feature) => ({ id: feature.id, latitude: feature.latitude, longitude: feature.longitude, source: "OSM" as const })), fromCache: true, availability: retrying ? features.length ? "stale" : "unavailable" : "ready" };
}

function parseMaxspeed(raw: string | undefined): number | null {
  if (!raw || !/^\s*\d/.test(raw)) return null;
  const value = Number(raw.match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
  if (!Number.isFinite(value)) return null;
  if (/km\/?h|kph/i.test(raw)) return value * 0.621371;
  if (/mph/i.test(raw)) return value;
  // Bare OSM maxspeed values have no universal unit. Keep them visible as
  // raw data, but do not invent a speed conversion for analytics.
  return null;
}

function featureFromElement(element: OverpassElement): OSMRoadFeature | null {
  const tags = element.tags ?? {};
  const latitude = Number(element.lat ?? element.center?.lat); const longitude = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || element.id == null) return null;
  const id = `osm-${element.type ?? "feature"}-${element.id}`;
  const highway = tags.highway;
  let featureType: OSMRoadFeatureType | null = null;
  if (tags.type === "restriction") featureType = "TURN_RESTRICTION";
  else if (tags.access && !["yes", "permissive", "public"].includes(tags.access)) featureType = "ACCESS_RESTRICTION";
  else if (highway === "traffic_signals") featureType = "TRAFFIC_SIGNAL";
  else if (highway === "stop") featureType = "STOP_SIGN";
  else if (highway === "give_way") featureType = "GIVE_WAY";
  else if (highway === "crossing") featureType = "PEDESTRIAN_CROSSING";
  else if (tags.traffic_calming) featureType = "TRAFFIC_CALMING";
  else if (tags.junction === "roundabout") featureType = "ROUNDABOUT";
  else if (highway) featureType = "ROAD";
  if (!featureType) return null;
  return {
    id, featureType, latitude, longitude, source: "OSM", name: tags.name, highway,
    roadClass: highway ?? tags.junction, maxspeedRaw: tags.maxspeed, maxspeedMph: parseMaxspeed(tags.maxspeed),
    oneway: tags.oneway === "yes" || tags.oneway === "1" || tags.oneway === "-1", access: tags.access,
    restriction: tags.restriction, trafficCalming: tags.traffic_calming,
  };
}

function dedupeFeatures(features: OSMRoadFeature[]): OSMRoadFeature[] {
  const seen = new Set<string>();
  return features.filter((feature) => { if (seen.has(feature.id)) return false; seen.add(feature.id); return true; });
}

/** Fetch OSM road context for the complete recorded route corridor. */
export async function getRoadContextForCorridor(corridor: OSMRoadCorridor): Promise<OSMRoadContext> {
  if (corridor.points.length < 2 || corridor.points.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) return { bounds: { south: 0, west: 0, north: 0, east: 0 }, signals: [], features: [], fromCache: false, availability: "unavailable" };
  const featureSettings = normaliseFeatureSettings(corridor.featureSettings);
  const requestedGroups = enabledFeatureGroups(featureSettings);
  const bounds = normaliseBounds(toBounds(corridor.points, Math.min(300, Math.max(100, corridor.paddingMetres ?? 200))));
  if (!requestedGroups.length) return { bounds, signals: [], features: [], fromCache: false, availability: "ready" };
  const cached = cachedContext(bounds, featureSettings, requestedGroups);
  if (cached) return cached;
  const key = `${boundsKey(bounds)}|${requestedGroups.join(",")}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = (async (): Promise<OSMRoadContext> => {
    const box = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
    const clauses = [
      featureSettings.trafficSignals ? `node[highway=traffic_signals]${box};way[highway=traffic_signals]${box};` : "",
      featureSettings.junctionControls ? `node[highway=stop]${box};node[highway=give_way]${box};` : "",
      featureSettings.pedestrianCrossings ? `node[highway=crossing]${box};` : "",
      featureSettings.calmingAndRoundabouts ? `node[traffic_calming]${box};way[junction=roundabout]${box};` : "",
      featureSettings.roadMetadata ? `way[highway~\"motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service\"]${box};way[highway][maxspeed]${box};` : "",
      featureSettings.restrictions ? `way[highway][oneway]${box};way[highway][access]${box};relation[type=restriction]${box};` : "",
    ].join("");
    const query = `[out:json][timeout:25];(${clauses});out center tags;`;
    const previous = read();
    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const body = await response.json() as { elements?: OverpassElement[] };
      const features = filterFeatures(dedupeFeatures((body.elements ?? []).map(featureFromElement).filter((feature): feature is OSMRoadFeature => Boolean(feature))), featureSettings);
      const context: OSMRoadContext = { bounds, signals: features.filter((feature) => feature.featureType === "TRAFFIC_SIGNAL").map((feature) => ({ id: feature.id, latitude: feature.latitude, longitude: feature.longitude, source: "OSM" as const })), features, fromCache: false, availability: "ready" };
      // Replace only the same corridor/group result. Other feature-group
      // caches survive settings changes and can be reused when switched on.
      write({ entries: [...previous.entries.filter((entry) => boundsKey(entry.bounds) !== boundsKey(bounds) || featureGroupsKey(entry.featureGroups ?? ALL_FEATURE_GROUPS) !== featureGroupsKey(requestedGroups)), { savedAt: Date.now(), bounds, features, featureGroups: requestedGroups }] });
      return context;
    } catch {
      // Negative-cache a failed corridor for ten minutes, while still using
      // any stale regional data already held on this device.
      const fallback = previous.entries.find((entry) => covers(entry.bounds, bounds) && entryCoversFeatureGroups(entry, requestedGroups));
      const features = filterFeatures(fallback?.features ?? [], featureSettings);
      write({ entries: [...previous.entries.filter((entry) => boundsKey(entry.bounds) !== boundsKey(bounds) || featureGroupsKey(entry.featureGroups ?? ALL_FEATURE_GROUPS) !== featureGroupsKey(requestedGroups)), { savedAt: Date.now(), retryAfter: Date.now() + 10 * 60_000, bounds, features, featureGroups: requestedGroups }] });
      return { bounds, features, signals: features.filter((feature) => feature.featureType === "TRAFFIC_SIGNAL").map((feature) => ({ id: feature.id, latitude: feature.latitude, longitude: feature.longitude, source: "OSM" as const })), fromCache: Boolean(fallback), availability: features.length ? "stale" : "unavailable" };
    }
  })();
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

/** Backwards-compatible signal-only API for existing route summaries/tests. */
export async function getTrafficSignalsForCorridor(corridor: OSMRoadCorridor): Promise<TrafficSignal[]> {
  return (await getRoadContextForCorridor(corridor)).signals;
}

export function clearOSMRoadIntelligenceCache() {
  inFlight.clear();
  if (typeof window !== "undefined") {
    localStorage.removeItem(CACHE_KEY);
    LEGACY_SIGNAL_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  }
}
