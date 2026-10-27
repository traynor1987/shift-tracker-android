import { googleAddressLookupService, type GoogleAddressLookupResult } from "./googleAddressLookupService.ts";

export type AddressLookupResult = GoogleAddressLookupResult;

/**
 * Compatibility wrapper for older callers. Precise address validation now
 * goes through the dedicated Google service; OSM/Overpass is reserved for
 * road infrastructure queries over GPS corridors and never receives this
 * address string.
 */
export async function lookupDeliveryAddress(query: string, options: { apiKey?: string | null; deliveryId?: string | null } = {}): Promise<AddressLookupResult | null> {
  const result = await googleAddressLookupService.lookup(query, options);
  return result.ok ? result.value : null;
}
