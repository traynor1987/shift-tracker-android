import { distanceMetres, getRealStatsGeofence, type Settings, type Shift, type StoreId } from './domain.ts';

export const STORES = {
  ormskirk: { name: 'Ormskirk', role: 'Home Store' },
  maghull: { name: 'Maghull', role: 'Cover Store', latitude: 53.516605, longitude: -2.943185 },
} as const;
export type StoreFilter = 'all' | StoreId;
/** Older records remain unattributed: their evidence is never rewritten. */
export function filterStoreShifts(shifts: Shift[], filter: StoreFilter): Shift[] {
  return filter === 'all' ? shifts : shifts.filter(shift => shift.storeId === filter);
}
/** Provisional cover-store sessions must never borrow home-store automation. */
export function settingsForStore(settings: Settings, storeId: StoreId): Settings {
  if (storeId === 'ormskirk') return settings;
  return { ...settings, singleRatePence: 85, doubleRatePence: 135, activeStoreId: "maghull", dominosReferenceRadiusMetres: settings.maghullDominosReferenceRadiusMetres ?? 75, locationAssistEnabled: maghullGeofenceVerified(settings), alwaysOnShiftMonitoring: maghullGeofenceVerified(settings) && settings.alwaysOnShiftMonitoring === true, recordDeliveryRoutes: settings.recordDeliveryRoutes, automaticDispatchTimer: maghullGeofenceVerified(settings) && settings.automaticDispatchTimer === true,
    carryoutDepartureAssistEnabled: false, carryoutDepartureZone: null,
    storePresenceProofEnabled: false, storePresenceStartProofEnabled: false,
    storeDisplayLatitude: STORES.maghull.latitude, storeDisplayLongitude: STORES.maghull.longitude,
    storeDisplayLabel: "Domino's Pizza — Liverpool — Maghull" };
}

export type MaghullFix = NonNullable<Settings['maghullGeofence']>['insideProof'];
export function maghullGeofenceValid(zone: Settings['maghullGeofence']): boolean {
  return !!zone && Number.isFinite(zone.latitude) && Math.abs(zone.latitude) <= 90 && Number.isFinite(zone.longitude) && Math.abs(zone.longitude) <= 180 && Number.isFinite(zone.radius) && zone.radius >= 10 && zone.radius <= 250 && distanceMetres(zone.latitude, zone.longitude, STORES.maghull.latitude, STORES.maghull.longitude) <= 1000;
}
/** The whole accuracy circle must be on one side; a GPS dot alone is insufficient. */
export function classifyMaghullFix(zone: Settings['maghullGeofence'], fix: MaghullFix, now = Date.now()): 'inside' | 'outside' | 'uncertain' {
  if (!maghullGeofenceValid(zone) || !fix || !Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || fix.accuracy > 25 || !Number.isFinite(fix.latitude) || Math.abs(fix.latitude) > 90 || !Number.isFinite(fix.longitude) || Math.abs(fix.longitude) > 180 || !Number.isFinite(Date.parse(fix.capturedAt)) || now - Date.parse(fix.capturedAt) > 600000 || Date.parse(fix.capturedAt) > now + 5000) return 'uncertain';
  const distance = distanceMetres(fix.latitude, fix.longitude, zone!.latitude, zone!.longitude);
  return distance + fix.accuracy < zone!.radius ? 'inside' : distance - fix.accuracy > zone!.radius ? 'outside' : 'uncertain';
}
export function maghullGeofenceVerified(settings: Settings): boolean {
  const zone = settings.maghullGeofence;
  const accepted = Date.parse(zone?.verifiedAt ?? '');
  return Number.isFinite(accepted) && !!zone && distanceMetres(zone.latitude, zone.longitude, STORES.maghull.latitude, STORES.maghull.longitude) + 5 < zone.radius && classifyMaghullFix(zone, zone.insideProof, accepted) === 'inside' && classifyMaghullFix(zone, zone.carParkProof, accepted) === 'inside' && classifyMaghullFix(zone, zone.outsideProof, accepted) === 'outside';
}
export function realGeofenceDefinitionForSettings(settings: Settings) {
  const zone = getRealStatsGeofence(settings);
  return { id: 'real' as const, label: 'Real Hustle', ...zone, entryRadius: zone.radius };
}

export function nativeStoreProfile(settings: Settings, id: StoreId) {
  const effective = settingsForStore(settings, id);
  const zone = getRealStatsGeofence(effective);
  const verified = id === 'ormskirk' || maghullGeofenceVerified(effective);
  return { id, ...zone, verified, revision: id === 'ormskirk' ? 'ormskirk-protected-v1' : JSON.stringify([zone.latitude, zone.longitude, zone.radius, effective.maghullGeofence?.verifiedAt ?? null]) };
}
