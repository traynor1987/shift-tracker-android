# Shift Tracker Phase 3 design gate

Status: **awaiting explicit user validation — no hosted backup or shared-report storage has been created**.

## Boundaries

- IndexedDB remains authoritative. This is backup/recovery, never live sync.
- A hosted checkpoint may be queued only after the corresponding local IndexedDB save resolves successfully.
- Hosted failure never blocks clocking, deliveries, breaks, GPS or other local operation.
- GPS points do not trigger uploads.

## Hosted encrypted backup

- Cloudflare D1 stores checkpoint metadata, retention state and hashes of capability tokens.
- Cloudflare R2 stores only encrypted checkpoint blobs.
- The browser creates a random 256-bit recovery secret. HKDF-SHA-256 derives an AES-256-GCM content key and separate capability material.
- Every checkpoint uses a fresh 96-bit nonce and authenticated metadata. The server never receives the recovery secret or derived content key.
- Cross-device recovery requires the user-held recovery key. Losing both the device and recovery key means the server cannot decrypt the backup.
- The client decrypts, runs the existing compatibility migration and canonical validator, previews counts, asks for confirmation, then performs one transactional IndexedDB restore.
- Retention: newest verified checkpoint is protected; keep the newest 30 meaningful checkpoints and one daily snapshot for 7 days. Purging begins only after a newer checkpoint has uploaded and been verified.

## Shared reports

- The client creates a frozen, privacy-sanitised shift/week report payload. It never exposes the live IndexedDB dataset.
- D1 stores expiry/revocation metadata and hashes of independent view/revoke tokens. R2 stores the frozen report payload.
- View and revoke tokens are independently generated 256-bit random values. Links use HTTPS and responses set `X-Robots-Tag: noindex, nofollow`.
- Default expiry is 7 days; revoke is immediate.
- Excluded: API keys, customer names, house numbers/names, raw addresses, exact destination coordinates, private settings and unrelated shifts.
- Route choice is explicit for every share: Full retained evidence, Simplified evidence, or No route. Simplified routes are decimated and coordinate-reduced; Full retained evidence is never the default.

## Required validation decision

Before implementation, confirm both:

1. Use a user-held random recovery key (download/copy once) for client-side encrypted hosted recovery.
2. Use D1 for metadata and R2 for encrypted backup/frozen report blobs with the retention/privacy rules above.

