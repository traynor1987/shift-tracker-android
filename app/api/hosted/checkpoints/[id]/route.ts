import { hostedBindings, jsonError, requireDevice, validHostedId } from "@/lib/hostedServer";
import { checkpointAvailable } from "@/lib/hostedLimits";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const deviceId = await requireDevice(request); const { id } = await context.params; if (!validHostedId(id)) throw new Error("INVALID_CHECKPOINT_ID"); const { db, bucket } = await hostedBindings(); const row = await db.prepare("SELECT object_key, ciphertext_sha256, status, expires_at FROM hosted_checkpoints WHERE id = ? AND device_id = ?").bind(id, deviceId).first<{ object_key: string; ciphertext_sha256: string; status: string; expires_at: string }>(); if (!row || !checkpointAvailable(row.status, row.expires_at)) throw new Error("NOT_FOUND"); const object = await bucket.get(row.object_key); if (!object) throw new Error("NOT_FOUND"); return new Response(await object.arrayBuffer(), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Ciphertext-SHA256": row.ciphertext_sha256 } }); }
  catch (error) { return jsonError(error); }
}
