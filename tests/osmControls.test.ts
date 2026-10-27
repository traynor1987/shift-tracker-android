import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8") + readFileSync(new URL("../components/RouteMapModal.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/osmRoadIntelligenceService.ts", import.meta.url), "utf8");

test("OSM settings retain one master and expose persisted optional controls", () => {
  assert.equal((component.match(/>OSM road intelligence<\/strong>/g) ?? []).length, 1);
  assert.match(component, /update\(\s*"osmRoadIntelligenceEnabled",\s*settings\.osmRoadIntelligenceEnabled === false,?\s*\)/);
  assert.match(component, /featureSettings=\{resolvedOSMRoadFeatureSettings\(\s*settings\.osmRoadFeatureSettings,?\s*\)\}/);
  assert.match(component, /disabled=\{!enabled\}\s+onClick=\{\(\) => onToggle\(key\)\}/);
  assert.match(component, /featureSettings\[key\] = !featureSettings\[key\]/);
  assert.match(component, /Complete-route corridor loading/);
  assert.match(component, /disabled\s+aria-label="Complete-route corridor loading is locked"/);
  assert.match(component, /\{enabled \? "ON 🔒" : "OFF"\}/);
});

test("master OFF stops optional route-summary requests without touching GPS evidence", () => {
  assert.match(component, /if \(!points\.length \|\| !osmRoadIntelligenceEnabled\) \{/);
  assert.match(component, /Promise\.resolve\(\)\.then\(\(\) => \{\s*if \(active\) \{\s*setTrafficSignals\(mergeTrafficSignals\(\[\], localRoadFeatures\)\);\s*setRoadFeatures\(\[\]\);\s*\}\s*\}\)/);
  assert.match(component, /osmRoadIntelligenceEnabled=\{\s*settings\.osmRoadIntelligenceEnabled !== false\s*\}\s+osmRoadFeatureSettings=/);
  assert.match(service, /if \(!requestedGroups\.length\) return/);
  assert.match(service, /export interface OSMRoadCorridor \{ points: Array<Pick<DeliveryRoutePoint, "latitude" \| "longitude">>; paddingMetres\?: number; featureSettings\?: OSMRoadFeatureSettings; \}/);
  assert.match(service, /overpass-api\.de\/api\/interpreter\?data=/);
  assert.match(component, /url: "https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png"/);
  assert.match(component, /REAL STATS GEOFENCE/);
  assert.match(component, /DELIVERY START \/ LEFT STORE/);
});

test("road-feature markers are hidden by default behind one visual overlay control", () => {
  assert.match(component, /const \[showRoadContext, setShowRoadContext\] = useState\(false\)/);
  assert.equal((component.match(/SHOW ROAD FEATURES/g) ?? []).length, 1);
  assert.equal((component.match(/HIDE ROAD FEATURES/g) ?? []).length, 1);
  assert.doesNotMatch(component, /SHOW TRAFFIC LIGHTS|HIDE TRAFFIC LIGHTS|showTrafficLights/);
  assert.match(component, /if \(showRoadContext\) \{\s*const corridorSignals/);
  assert.match(component, /if \(showRoadContext\) \{\s*const visibleRoadFeatures/);
  assert.match(component, /void loadRoadContext\(points, featureSettings\)/);
});
