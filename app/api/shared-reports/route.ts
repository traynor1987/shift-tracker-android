import { readBoundedJson } from "@/lib/hostedLimits";
import { hostedBindings, jsonError, pruneExpiredHostedObjects, reserveHostedUpload, requireDevice, safeText, sha256Hex, validHostedId } from "@/lib/hostedServer";

export async function GET(request: Request) {
  try { const deviceId = await requireDevice(request); await pruneExpiredHostedObjects(); const { db } = await hostedBindings(); const rows = (await db.prepare("SELECT id, report_type, title, route_privacy, created_at, expires_at, status, revoked_at FROM shared_reports WHERE device_id = ? ORDER BY created_at DESC LIMIT 100").bind(deviceId).all()).results ?? []; return Response.json({ reports: rows }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const deviceId = await requireDevice(request); const body = await readBoundedJson<{ id?: string; viewToken?: string; revokeToken?: string; reportType?: string; title?: string; routePrivacy?: string; expiresAt?: string; report?: unknown }>(request, 6 * 1024 * 1024);
    const id = body.id ?? ""; if (!validHostedId(id) || (body.viewToken?.length ?? 0) < 40 || (body.revokeToken?.length ?? 0) < 40) throw new Error("INVALID_SHARE_CAPABILITY");
    if (!(["shift", "week"].includes(body.reportType ?? "")) || !(["full", "simplified", "none"].includes(body.routePrivacy ?? ""))) throw new Error("INVALID_SHARE_OPTIONS");
    const expiresAt = body.expiresAt ?? ""; const lifetime = Date.parse(expiresAt) - Date.now(); if (!Number.isFinite(lifetime) || lifetime < 60_000 || lifetime > 8 * 86_400_000) throw new Error("INVALID_SHARE_EXPIRY");
    const reportText = JSON.stringify(body.report); if (!reportText || new TextEncoder().encode(reportText).byteLength > 5 * 1024 * 1024) throw new Error("INVALID_SHARE_SIZE");
    const { db, bucket } = await hostedBindings(); const objectKey = `shares/${deviceId}/${id}.json`; const now = new Date().toISOString();
    await reserveHostedUpload(deviceId, new TextEncoder().encode(reportText).byteLength);
    await pruneExpiredHostedObjects();
    const put = await bucket.put(objectKey, reportText, { httpMetadata: { contentType: "application/json" }, onlyIf: new Headers({ "If-None-Match": "*" }) });
    if (put === null) throw new Error("SHARE_CONFLICT");
    try { await db.prepare("INSERT INTO shared_reports (id, device_id, view_token_hash, revoke_token_hash, object_key, report_type, title, route_privacy, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')").bind(id, deviceId, await sha256Hex(body.viewToken!), await sha256Hex(body.revokeToken!), objectKey, body.reportType, safeText(body.title, 160), body.routePrivacy, now, expiresAt).run(); }
    catch (error) { await bucket.delete(objectKey); throw error; }
    return Response.json({ id, status: "active", createdAt: now, expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try { const deviceId = await requireDevice(request); const body = await readBoundedJson<{ id?: string; revokeToken?: string }>(request, 2048); const id = body.id ?? ""; if (!validHostedId(id) || (body.revokeToken?.length ?? 0) < 40) throw new Error("INVALID_REVOKE_CAPABILITY"); const { db, bucket } = await hostedBindings(); const row = await db.prepare("SELECT object_key, revoke_token_hash FROM shared_reports WHERE id = ? AND device_id = ?").bind(id, deviceId).first<{ object_key: string; revoke_token_hash: string }>(); if (!row || row.revoke_token_hash !== await sha256Hex(body.revokeToken!)) throw new Error("UNAUTHORISED"); const now = new Date().toISOString(); await db.prepare("UPDATE shared_reports SET status = 'revoked', revoked_at = ? WHERE id = ? AND device_id = ?").bind(now, id, deviceId).run(); await bucket.delete(row.object_key); return Response.json({ id, status: "revoked", revokedAt: now }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
