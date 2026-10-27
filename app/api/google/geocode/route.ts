/** Server-only Google Geocoding boundary. The API key is never sent to the PWA. */
import { jsonError, requirePaidRequest } from "@/lib/hostedServer";
import { readBoundedJson } from "@/lib/hostedLimits";
export async function POST(request: Request) {
  const apiKey = (process.env.GOOGLE_GEOCODING_API_KEY ?? "").trim();
  if (!apiKey) return Response.json({ error: "GOOGLE_GEOCODING_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let body: { query?: string; storeLatitude?: number; storeLongitude?: number };
  try { body = await readBoundedJson<typeof body>(request, 4096); } catch (error) { return jsonError(error); }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 500) return Response.json({ error: "INVALID_ADDRESS" }, { status: 400 });
  const bias = Number.isFinite(body.storeLatitude) && Number.isFinite(body.storeLongitude)
    ? `&bounds=${Number(body.storeLatitude) - 0.12},${Number(body.storeLongitude) - 0.18}|${Number(body.storeLatitude) + 0.12},${Number(body.storeLongitude) + 0.18}`
    : "";
  try {
    await requirePaidRequest(request, "geocode");
  } catch (error) { return jsonError(error); }
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:GB${bias}&key=${encodeURIComponent(apiKey)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return Response.json({ error: "GOOGLE_GEOCODING_UNAVAILABLE" }, { status: 502 });
    const json = await response.json() as { status?: string; results?: unknown[] };
    if (json.status !== "OK" || !Array.isArray(json.results) || !json.results.length) return Response.json({ error: "NO_ADDRESS_MATCH" }, { status: 422 });
    return Response.json({ status: json.status, results: json.results.slice(0, 3) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "GOOGLE_GEOCODING_UNAVAILABLE" }, { status: 502 }); }
}
