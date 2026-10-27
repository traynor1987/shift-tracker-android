import type { Settings, Shift, StoreId } from './domain.ts';

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
  return { ...settings, locationAssistEnabled: false, alwaysOnShiftMonitoring: false, recordDeliveryRoutes: false, automaticDispatchTimer: false,
    carryoutDepartureAssistEnabled: false, carryoutDepartureZone: null,
    storePresenceProofEnabled: false, storePresenceStartProofEnabled: false,
    storeDisplayLatitude: STORES.maghull.latitude, storeDisplayLongitude: STORES.maghull.longitude,
    storeDisplayLabel: "Domino's Pizza — Liverpool — Maghull" };
}
