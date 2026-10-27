import { nativeSampleIsFresh } from "./nativeBridge.ts";

export function nativeStreamIsStalled(
  deliveryId: string,
  latestProviderFix: { deliveryId: string; timestamp: number } | null,
  fallbackTimestamp: string | number | null | undefined,
  now = Date.now(),
  maximumAgeMs = 25_000,
) {
  const latest = latestProviderFix?.deliveryId === deliveryId
    ? latestProviderFix.timestamp
    : fallbackTimestamp;
  return !nativeSampleIsFresh(latest, now, maximumAgeMs);
}

export type NativeSampleIngestionResult = {
  status: "persisted" | "rejected";
};

type IdentifiedNativeSample = {
  sampleId: string;
};

/**
 * Processes recovery samples in order and removes each from Android only
 * after the PWA has either durably persisted it or deliberately rejected it.
 * A persistence failure stops the batch, leaving that sample and everything
 * after it in Android's encrypted recovery journal for the next replay.
 */
export async function flushNativeSamples<T extends IdentifiedNativeSample>(
  samples: readonly T[],
  ingest: (sample: T) => Promise<NativeSampleIngestionResult>,
  acknowledge: (sampleId: string) => void,
): Promise<void> {
  for (const sample of samples) {
    await ingest(sample);
    acknowledge(sample.sampleId);
  }
}


/** Raw/uncertain callbacks cannot keep the accepted-fix watchdog healthy. */
export function acceptedNativeFix(
  previous: { deliveryId: string; timestamp: number } | null,
  sample: { deliveryId: string; timestamp: number },
  activeDeliveryId: string | null | undefined,
  accepted: boolean,
  now = Date.now(),
) {
  if (!accepted || sample.deliveryId !== activeDeliveryId || !Number.isFinite(sample.timestamp) || sample.timestamp > now + 5_000) return previous;
  if (previous?.deliveryId === sample.deliveryId && previous.timestamp >= sample.timestamp) return previous;
  return { deliveryId: sample.deliveryId, timestamp: sample.timestamp };
}
