import assert from "node:assert/strict";
import test from "node:test";
import { clearOSMRoadIntelligenceCache, getRoadContextForCorridor } from "../lib/osmRoadIntelligenceService.ts";
import type { OSMRoadFeatureSettings } from "../lib/domain.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const points = [
  { latitude: 53.56845, longitude: -2.88802 },
  { latitude: 53.5701, longitude: -2.8832 },
];
const allOff: OSMRoadFeatureSettings = { trafficSignals: false, junctionControls: false, pedestrianCrossings: false, calmingAndRoundabouts: false, roadMetadata: false, restrictions: false };
const signalsOnly: OSMRoadFeatureSettings = { ...allOff, trafficSignals: true };

test("optional OSM groups gate requests and compatible cached data survives OFF to ON", async () => {
  const globals = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const originalWindow = globals.window;
  const originalStorage = globals.localStorage;
  const originalFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  let requests = 0;
  let lastQuery = "";
  globals.window = {};
  globals.localStorage = storage;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests += 1;
    lastQuery = decodeURIComponent(String(input).split("data=")[1] ?? "");
    return { ok: true, status: 200, json: async () => ({ elements: [{ type: "node", id: 1, lat: 53.569, lon: -2.886, tags: { highway: "traffic_signals" } }] }) } as Response;
  }) as typeof fetch;
  try {
    clearOSMRoadIntelligenceCache();
    const first = await getRoadContextForCorridor({ points, featureSettings: signalsOnly });
    assert.equal(requests, 1);
    assert.equal(first.signals.length, 1);
    assert.match(lastQuery, /highway=traffic_signals/);
    assert.doesNotMatch(lastQuery, /highway=crossing|junction=roundabout|type=restriction|maxspeed/);

    const off = await getRoadContextForCorridor({ points, featureSettings: allOff });
    assert.equal(off.features.length, 0);
    assert.equal(requests, 1, "all optional groups OFF must make no request");

    const restored = await getRoadContextForCorridor({ points, featureSettings: signalsOnly });
    assert.equal(restored.fromCache, true);
    assert.equal(restored.signals.length, 1);
    assert.equal(requests, 1, "OFF to ON must reuse compatible cached context");
  } finally {
    clearOSMRoadIntelligenceCache();
    globalThis.fetch = originalFetch;
    globals.window = originalWindow;
    globals.localStorage = originalStorage;
  }
});
