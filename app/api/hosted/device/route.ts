import { jsonError, registerDevice } from "@/lib/hostedServer";
import { readBoundedJson } from "@/lib/hostedLimits";

export async function POST(request: Request) {
  try { const body = await readBoundedJson<{ deviceId?: string; authToken?: string }>(request, 2048); await registerDevice(body.deviceId ?? "", body.authToken ?? ""); return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
