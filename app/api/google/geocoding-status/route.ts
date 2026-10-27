/** Configuration check only. Never returns key material. */
export async function GET() {
  const configured = Boolean((process.env.GOOGLE_GEOCODING_API_KEY ?? "").trim());
  return Response.json({ configured, ...(configured ? {} : { reason: "GOOGLE_GEOCODING_API_KEY_MISSING" }) }, { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
