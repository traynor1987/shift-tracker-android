import { hostedBindings, jsonError, pruneVerifiedCheckpoints, pruneExpiredHostedObjects, requireDevice, reserveHostedUpload, safeText, sha256Hex, validHostedId } from "@/lib/hostedServer";
import { checkpointExpiry, readBoundedBody, readBoundedJson } from "@/lib/hostedLimits";

export async function GET(request: Request) {
  try { const deviceId = await requireDevice(request); await pruneExpiredHostedObjects(); const { db } = await hostedBindings(); const rows = (await db.prepare("SELECT id, reason, app_version, shift_context, created_at, expires_at, byte_size, status, verified_at FROM hosted_checkpoints WHERE device_id = ? AND status = 'verified' AND expires_at > ? ORDER BY created_at DESC LIMIT 50").bind(deviceId, new Date().toISOString()).all()).results ?? []; return Response.json({ checkpoints: rows }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const deviceId = await requireDevice(request); const url = new URL(request.url); const id = url.searchParams.get("id") ?? ""; if (!validHostedId(id)) throw new Error("INVALID_CHECKPOINT_ID");
    const reason = safeText(request.headers.get("x-checkpoint-reason"), 100) || "Meaningful save"; const appVersion = safeText(request.headers.get("x-app-version"), 30); const shiftContext = safeText(request.headers.get("x-shift-context"), 120) || null; const createdAt = request.headers.get("x-created-at") ?? "";
    const expiresAt = checkpointExpiry(createdAt);
    const body = await readBoundedBody(request, 32 * 1024 * 1024); if (!body.byteLength) throw new Error("INVALID_CHECKPOINT_SIZE");
    await reserveHostedUpload(deviceId, body.byteLength);
    await pruneExpiredHostedObjects();
    const { db, bucket } = await hostedBindings(); const objectKey = `checkpoints/${deviceId}/${id}.bin`; const digest = await sha256Hex(body); const dailyBucket = new Date(createdAt).toISOString().slice(0, 10);
    const put = await bucket.put(objectKey, body, { httpMetadata: { contentType: "application/octet-stream" }, onlyIf: new Headers({ "If-None-Match": "*" }) });
    if (put === null) throw new Error("CHECKPOINT_CONFLICT");
    try { await db.prepare("INSERT INTO hosted_checkpoints (id, device_id, object_key, reason, app_version, shift_context, created_at, expires_at, daily_bucket, ciphertext_sha256, byte_size, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stored')").bind(id, deviceId, objectKey, reason, appVersion, shiftContext, createdAt, expiresAt, dailyBucket, digest, body.byteLength).run(); }
    catch (error) { await bucket.delete(objectKey); throw error; }
    return Response.json({ id, status: "stored", ciphertextSha256: digest, byteSize: body.byteLength }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try { const deviceId = await requireDevice(request); const body = await readBoundedJson<{ id?: string }>(request, 2048); const id = body.id ?? ""; if (!validHostedId(id)) throw new Error("INVALID_CHECKPOINT_ID"); const { db } = await hostedBindings(); const now = new Date().toISOString(); const row = await db.prepare("SELECT status FROM hosted_checkpoints WHERE id = ? AND device_id = ? AND expires_at > ?").bind(id, deviceId, now).first<{ status: string }>(); if (!row) throw new Error("NOT_FOUND"); if (row.status !== "verified") await db.prepare("UPDATE hosted_checkpoints SET status = 'verified', verified_at = ? WHERE id = ? AND device_id = ? AND status = 'stored'").bind(now, id, deviceId).run(); await pruneVerifiedCheckpoints(deviceId); return Response.json({ id, status: "verified", verifiedAt: now }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
