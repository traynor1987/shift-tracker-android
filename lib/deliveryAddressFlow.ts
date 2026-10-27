import type { DeliveryDestinationAddress } from "./domain.ts";
import type { GoogleAddressLookupResponse, GoogleAddressLookupResult } from "./googleAddressLookupService.ts";
import type { VisionAddressCandidate } from "./novaVisionService.ts";

export function parseDeliveryAddressText(value: string, source: DeliveryDestinationAddress["addressSource"] = "manual"): DeliveryDestinationAddress {
  const lines = value.split(/\n|,/).map((line) => line.trim()).filter(Boolean);
  const postcode = (value.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] ?? "").toUpperCase().replace(/\s+/g, " ");
  const withoutPostcode = value.replace(new RegExp(postcode.replace(" ", "\\s*"), "i"), "").trim();
  const addressLine = lines[0] ?? withoutPostcode;
  const numberMatch = addressLine.match(/^([\w-]+)\s+(.+)$/);
  const houseNumberOrName = numberMatch?.[1];
  const street = numberMatch?.[2] ?? addressLine;
  const locality = lines.length > 2 ? lines[lines.length - 2] : lines.length === 2 && !postcode ? lines[1] : undefined;
  return { fullAddress: value.trim() || undefined, houseNumberOrName, street: street || undefined, locality, postcode: postcode || undefined, addressSource: source, privacyStatus: "precise" };
}

export function novaAddressCandidateText(candidate: VisionAddressCandidate) {
  return [candidate.houseNumberOrName, candidate.street, candidate.locality, candidate.postcode].filter(Boolean).join("\n");
}

export async function resolveDeliveryAddressDrafts(options: {
  drafts: string[];
  count: number;
  source: DeliveryDestinationAddress["addressSource"];
  googleValidationEnabled: boolean;
  matches: Array<GoogleAddressLookupResult | null>;
  confirmed: boolean[];
  attempted: boolean[];
  lookup: (query: string, index: number) => Promise<GoogleAddressLookupResponse>;
}) {
  const matches = [...options.matches];
  const confirmed = [...options.confirmed];
  const attempted = [...options.attempted];
  const destinations: DeliveryDestinationAddress[] = [];
  let awaitingConfirmation = false;
  let lookupFailed = false;

  for (const [index, draft] of options.drafts.slice(0, options.count).entries()) {
    if (!draft.trim()) continue;
    const parsed = parseDeliveryAddressText(draft, options.source);
    let match = matches[index] ?? null;
    if (!match && options.googleValidationEnabled && !attempted[index]) {
      attempted[index] = true;
      try {
        const result = await options.lookup(draft, index);
        if (result.ok) {
          match = result.value;
          matches[index] = match;
          confirmed[index] = false;
        } else lookupFailed = true;
      } catch {
        lookupFailed = true;
      }
    }
    if (match) {
      parsed.street = match.street ?? parsed.street;
      parsed.locality = match.locality ?? parsed.locality;
      parsed.postcode = match.postcode ?? parsed.postcode;
      parsed.houseNumberOrName = match.houseNumberOrName ?? parsed.houseNumberOrName;
      parsed.destination = { latitude: match.latitude, longitude: match.longitude };
      if (confirmed[index] !== true) awaitingConfirmation = true;
    }
    if (!match && attempted[index]) lookupFailed = true;
    destinations.push(parsed);
  }

  return { destinations, matches, confirmed, attempted, awaitingConfirmation, lookupFailed };
}
